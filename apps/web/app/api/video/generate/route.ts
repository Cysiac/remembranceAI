import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import type { GenerateVideoResponse } from "@shared/types";
import { textToSpeech, simulateAgentReply } from "@/lib/elevenlabs";
import { rowToPersona } from "@/lib/personaMapper";
import { buildVideoScriptPrompt } from "@/lib/promptBuilder";
import { getServiceSupabase } from "@/lib/supabaseServer";
import { generateVeoVideo } from "@/lib/veo";
import { muxAudioOntoVideo } from "@/lib/videoMux";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  persona_id: z.string().uuid(),
  scene: z.string().min(3).max(2_000),
  reference_photo_key: z.string().min(1).max(500),
});

interface PersonaRow {
  id: string;
  name: string;
  relationship: string;
  status: string;
  voice_id: string | null;
  agent_id: string | null;
  dataset_id: string | null;
  metadata: unknown;
  error_message: string | null;
  created_at: string;
}

export async function POST(req: Request): Promise<Response> {
  const demoUrl = demoVideoUrl(req);
  if (demoUrl) {
    return NextResponse.json({ video_url: demoUrl } satisfies GenerateVideoResponse);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { persona_id, scene, reference_photo_key } = parsed.data;

  const { data, error } = await supabase
    .from("personas")
    .select(
      "id, name, relationship, status, voice_id, agent_id, dataset_id, metadata, error_message, created_at",
    )
    .eq("id", persona_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "db_read_failed", detail: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "persona_not_found" }, { status: 404 });
  }

  const persona = rowToPersona(data as PersonaRow);
  if (persona.status !== "ready") {
    return NextResponse.json(
      { error: "persona_not_ready", status: persona.status },
      { status: 409 },
    );
  }
  if (!persona.voice_id || !persona.agent_id) {
    return NextResponse.json(
      { error: "persona_missing_voice_or_agent" },
      { status: 409 },
    );
  }

  let referencePhoto: { bytes: Buffer; mimeType: string };
  try {
    referencePhoto = await downloadReferencePhoto(reference_photo_key);
  } catch (err) {
    return NextResponse.json(
      {
        error: "reference_photo_download_failed",
        detail: errorMessage(err),
      },
      { status: 400 },
    );
  }

  try {
    const scriptPrompt = buildVideoScriptPrompt(persona, scene);
    const { reply: script } = await simulateAgentReply({
      agent_id: persona.agent_id,
      user_message: scriptPrompt,
    });

    const cleanScript = sanitizeSpokenScript(script);
    const veoPrompt = buildVeoPrompt(persona.name, scene);

    const [voiceMp3, veoMp4] = await Promise.all([
      textToSpeech({ voice_id: persona.voice_id, text: cleanScript }),
      generateVeoVideo({
        prompt: veoPrompt,
        imageBytes: referencePhoto.bytes,
        mimeType: referencePhoto.mimeType,
      }),
    ]);

    const finalMp4 = await muxAudioOntoVideo({ video: veoMp4, audio: voiceMp3 });
    const videoKey = await uploadRenderedVideo(persona.id, finalMp4);
    const signed = await createSignedVideoUrl(videoKey);

    return NextResponse.json(
      { video_url: signed } satisfies GenerateVideoResponse,
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "video_generation_failed",
        detail: errorMessage(err),
      },
      { status: 502 },
    );
  }
}

function demoVideoUrl(req: Request): string | null {
  const url = new URL(req.url);
  if (url.searchParams.get("demo") !== "1") return null;
  return process.env.DEMO_VIDEO_URL || null;
}

async function downloadReferencePhoto(fileKey: string): Promise<{
  bytes: Buffer;
  mimeType: string;
}> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from("uploads").download(fileKey);
  if (error || !data) {
    throw new Error(error?.message ?? "missing reference photo data");
  }
  const arrayBuffer = await data.arrayBuffer();
  return {
    bytes: Buffer.from(arrayBuffer),
    mimeType: data.type || mimeTypeFromKey(fileKey),
  };
}

function mimeTypeFromKey(fileKey: string): string {
  const lower = fileKey.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function buildVeoPrompt(personaName: string, scene: string): string {
  return [
    `Create a gentle memorial video of ${personaName} from the provided reference photo.`,
    "Use a warm, respectful, realistic style with subtle head and facial movement.",
    "Keep the camera steady, softly lit, and emotionally understated.",
    "Do not add text, captions, logos, or watermarks.",
    `Scene intent: ${scene.trim()}`,
  ].join(" ");
}

function sanitizeSpokenScript(script: string): string {
  return script
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\[(?:.*?)\]/g, "")
    .replace(/\((?:stage directions?|camera|music|pause).*?\)/gi, "")
    .trim();
}

async function uploadRenderedVideo(
  personaId: string,
  videoBytes: Buffer,
): Promise<string> {
  const supabase = getServiceSupabase();
  const key = `${personaId}/${randomUUID()}.mp4`;
  const { error } = await supabase.storage.from("videos").upload(key, videoBytes, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (error) {
    throw new Error(`video upload failed: ${error.message}`);
  }
  return key;
}

async function createSignedVideoUrl(fileKey: string): Promise<string> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUrl(fileKey, 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(`video URL signing failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
