/**
 * Gemini Veo image-to-video helper.
 *
 * Wraps `@google/genai` so the rest of the BE only sees:
 *   const mp4 = await generateVeoVideo({ prompt, imageBytes, mimeType });
 *
 * We operate against Vertex AI so billing is charged to the configured Google
 * Cloud project instead of the AI Studio prepaid Gemini API balance.
 */

import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

export interface VeoGenerateOptions {
  /** Free-form scene description fed to Veo as the text prompt. */
  prompt: string;
  /** Reference photo bytes (will be base64-encoded for the Gemini API). */
  imageBytes: Buffer;
  /** MIME type of the reference photo (e.g. "image/jpeg" or "image/png"). */
  mimeType: string;
  /** Defaults to env GEMINI_VEO_MODEL or "veo-3.0-generate-preview". */
  model?: string;
  /** Defaults to "16:9". */
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** Poll interval in ms while the long-running operation is in flight. */
  pollIntervalMs?: number;
  /** Hard ceiling on how long we'll poll. Defaults to 5 minutes. */
  pollTimeoutMs?: number;
  /** "dont_allow" | "allow_adult" | "allow_all" — Veo person-generation policy. */
  personGeneration?: "dont_allow" | "allow_adult" | "allow_all";
}

export class VeoGenerationError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "VeoGenerationError";
    this.cause = cause;
  }
}

function vertexProject(): string {
  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.VERTEX_AI_PROJECT;
  if (!project) {
    throw new VeoGenerationError(
      "GOOGLE_CLOUD_PROJECT or VERTEX_AI_PROJECT must be set for Vertex AI Veo billing",
    );
  }
  return project;
}

function vertexLocation(): string {
  const location =
    process.env.GOOGLE_CLOUD_LOCATION ||
    process.env.GOOGLE_CLOUD_REGION ||
    process.env.VERTEX_AI_LOCATION;
  if (!location) {
    throw new VeoGenerationError(
      "GOOGLE_CLOUD_LOCATION or VERTEX_AI_LOCATION must be set for Vertex AI Veo billing",
    );
  }
  return location;
}

function modelName(override?: string): string {
  const configured =
    override ?? process.env.VERTEX_VEO_MODEL ?? process.env.GEMINI_VEO_MODEL;

  // `veo-3.0-generate-preview` was valid for the old AI Studio path, but it is
  // discontinued/not reliably available through Vertex AI. Keep existing envs
  // working by upgrading that legacy value to a current Vertex image-to-video model.
  if (!configured || configured === "veo-3.0-generate-preview") {
    return "veo-3.1-fast-generate-001";
  }
  return configured;
}

/**
 * Submit a Veo image-to-video job, poll until it completes, then download the
 * first generated MP4 and return it as a Buffer.
 */
export async function generateVeoVideo(opts: VeoGenerateOptions): Promise<Buffer> {
  const {
    prompt,
    imageBytes,
    mimeType,
    model,
    aspectRatio = "16:9",
    pollIntervalMs = 10_000,
    pollTimeoutMs = 5 * 60_000,
    personGeneration = "allow_adult",
  } = opts;

  const project = vertexProject();
  const location = vertexLocation();
  const ai = new GoogleGenAI({ vertexai: true, project, location });

  let operation;
  try {
    operation = await ai.models.generateVideos({
      model: modelName(model),
      prompt,
      image: {
        imageBytes: imageBytes.toString("base64"),
        mimeType,
      },
      config: {
        aspectRatio,
        personGeneration,
        numberOfVideos: 1,
      },
    });
  } catch (err) {
    throw new VeoGenerationError(
      `Veo generateVideos request failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const startedAt = Date.now();
  while (!operation.done) {
    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new VeoGenerationError(
        `Veo job did not finish within ${Math.round(pollTimeoutMs / 1000)}s`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    try {
      operation = await pollOperation(ai, operation);
    } catch (err) {
      throw new VeoGenerationError(
        `Veo operation poll failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  const opError = (operation as { error?: { message?: string } }).error;
  if (opError?.message) {
    throw new VeoGenerationError(`Veo job returned an error: ${opError.message}`);
  }

  const generated = operation.response?.generatedVideos?.[0];
  if (!generated?.video) {
    throw new VeoGenerationError(
      "Veo job completed but did not return a generated video",
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), "memorial-veo-"));
  const outPath = path.join(dir, "veo.mp4");
  try {
    await ai.files.download({ file: generated, downloadPath: outPath });
    return await readFile(outPath);
  } catch (err) {
    throw new VeoGenerationError(
      `Veo MP4 download failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * `@google/genai` exposes both a generic `operations.get` (Vertex/docs sample)
 * and a video-specific `operations.getVideosOperation` (codegen guide). Try the
 * specific one first and fall back so we don't hard-fail on minor SDK churn.
 */
async function pollOperation(
  ai: GoogleGenAI,
  operation: Awaited<ReturnType<GoogleGenAI["models"]["generateVideos"]>>,
): Promise<typeof operation> {
  const ops = ai.operations as unknown as Record<string, unknown>;
  if (typeof ops.getVideosOperation === "function") {
    return (ops.getVideosOperation as (args: { operation: typeof operation }) => Promise<typeof operation>)({
      operation,
    });
  }
  if (typeof ops.get === "function") {
    return (ops.get as (args: { operation: typeof operation }) => Promise<typeof operation>)({
      operation,
    });
  }
  throw new VeoGenerationError(
    "Installed @google/genai version exposes neither operations.getVideosOperation nor operations.get",
  );
}
