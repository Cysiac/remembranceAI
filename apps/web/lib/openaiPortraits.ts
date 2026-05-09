import { Buffer } from "node:buffer";

import type { PresenceMood } from "@shared/types";

export interface PortraitVariant {
  mood: PresenceMood;
  imageBytes: Buffer;
  mimeType: "image/png";
}

export interface OpenAIPortraitOptions {
  imageBytes: Buffer;
  mimeType: string;
  personaName: string;
  relationship: string;
  toneSummary?: string;
}

export class PortraitGenerationError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PortraitGenerationError";
    this.cause = cause;
  }
}

const OPENAI_IMAGE_ENDPOINT = "https://api.openai.com/v1/images/edits";
const MOODS: PresenceMood[] = ["idle", "listening", "speaking"];

export async function generatePresencePortraits(
  opts: OpenAIPortraitOptions,
): Promise<PortraitVariant[]> {
  const results: PortraitVariant[] = [];
  for (const mood of MOODS) {
    results.push({
      mood,
      imageBytes: await generatePortraitForMood(opts, mood),
      mimeType: "image/png",
    });
  }
  return results;
}

async function generatePortraitForMood(
  opts: OpenAIPortraitOptions,
  mood: PresenceMood,
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new PortraitGenerationError("OPENAI_API_KEY must be set on the server");
  }

  const form = new FormData();
  form.set("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
  form.set("prompt", buildPortraitPrompt(opts, mood));
  form.set("size", "1024x1024");
  form.set(
    "image",
    new Blob([new Uint8Array(opts.imageBytes)], { type: opts.mimeType }),
    filenameForMime(opts.mimeType),
  );

  let res: Response;
  try {
    res = await fetch(OPENAI_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body: form,
      cache: "no-store",
    });
  } catch (err) {
    throw new PortraitGenerationError(
      `OpenAI image request failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const body = (await res.json().catch(() => null)) as OpenAIImagesResponse | null;
  if (!res.ok) {
    throw new PortraitGenerationError(
      `OpenAI image request failed (${res.status}): ${
        body?.error?.message ?? res.statusText
      }`,
    );
  }

  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) {
    throw new PortraitGenerationError("OpenAI image response did not include b64_json");
  }

  return Buffer.from(b64, "base64");
}

function buildPortraitPrompt(opts: OpenAIPortraitOptions, mood: PresenceMood): string {
  const expression =
    mood === "speaking"
      ? "a warm, gentle smile, as if softly saying hello"
      : mood === "listening"
        ? "an attentive, compassionate expression, as if listening closely"
        : "a calm, neutral, reassuring expression";
  const tone = opts.toneSummary ? `Tone notes: ${opts.toneSummary}.` : "";

  return [
    `Use the uploaded reference photo of ${opts.personaName}, the user's ${opts.relationship}, as the identity source.`,
    `Create a respectful memorial portrait with ${expression}.`,
    "Preserve the person's facial identity, apparent age, ethnicity, hair, and distinctive features from the reference image.",
    "Keep the result realistic, softly lit, front-facing, and suitable for a small circular chat avatar.",
    "Do not make the person look younger, do not add text, and do not add logos or watermarks.",
    tone,
  ]
    .filter(Boolean)
    .join(" ");
}

function filenameForMime(mimeType: string): string {
  if (mimeType === "image/png") return "reference.png";
  if (mimeType === "image/webp") return "reference.webp";
  return "reference.jpg";
}

interface OpenAIImagesResponse {
  data?: Array<{
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
}
