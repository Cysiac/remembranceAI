import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import type {
  GeneratePortraitsResponse,
  Persona,
  PresenceMood,
} from "@shared/types";
import { generatePresencePortraits } from "@/lib/openaiPortraits";
import { rowToPersona } from "@/lib/personaMapper";
import {
  ensureBucket,
  getServiceSupabase,
  signedDownloadUrl,
} from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  persona_id: z.string().min(1),
  reference_photo_key: z.string().min(1).max(500),
});

const PersonaIdSchema = z.string().uuid();

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

  const { persona_id, reference_photo_key } = parsed.data;
  if (!PersonaIdSchema.safeParse(persona_id).success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        issues: { fieldErrors: { persona_id: ["Invalid uuid"] } },
      },
      { status: 400 },
    );
  }

  let persona: Persona | null;
  try {
    persona = await loadPersona(persona_id);
  } catch (err) {
    return NextResponse.json(
      { error: "db_read_failed", detail: errorMessage(err) },
      { status: 500 },
    );
  }

  if (!persona) {
    return NextResponse.json({ error: "persona_not_found" }, { status: 404 });
  }

  if (persona.status !== "ready") {
    return NextResponse.json(
      { error: "persona_not_ready", status: persona.status },
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
    const variants = await generatePresencePortraits({
      imageBytes: referencePhoto.bytes,
      mimeType: referencePhoto.mimeType,
      personaName: persona.name,
      relationship: persona.relationship,
      toneSummary: persona.metadata?.toneSummary,
    });
    const portraits = await uploadPortraits(persona.id, variants);

    return NextResponse.json(
      { portraits } satisfies GeneratePortraitsResponse,
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "portrait_generation_failed",
        detail: errorMessage(err),
      },
      { status: 502 },
    );
  }
}

async function loadPersona(personaId: string): Promise<Persona | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("personas")
    .select(
      "id, name, relationship, status, voice_id, agent_id, dataset_id, metadata, error_message, created_at",
    )
    .eq("id", personaId)
    .maybeSingle();

  if (error) {
    throw new Error(`db_read_failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToPersona(data as PersonaRow);
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

async function uploadPortraits(
  personaId: string,
  variants: Array<{ mood: PresenceMood; imageBytes: Buffer; mimeType: string }>,
): Promise<Partial<Record<PresenceMood, string>>> {
  await ensureBucket("portraits");
  const supabase = getServiceSupabase();
  const portraits: Partial<Record<PresenceMood, string>> = {};

  for (const variant of variants) {
    const key = `${personaId}/${variant.mood}-${randomUUID()}.png`;
    const { error } = await supabase.storage
      .from("portraits")
      .upload(key, variant.imageBytes, {
        contentType: variant.mimeType,
        upsert: false,
      });
    if (error) {
      throw new Error(`portrait upload failed: ${error.message}`);
    }
    portraits[variant.mood] = await signedDownloadUrl(key, {
      bucket: "portraits",
      expiresIn: 60 * 60,
    });
  }

  return portraits;
}

function mimeTypeFromKey(fileKey: string): string {
  const lower = fileKey.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
