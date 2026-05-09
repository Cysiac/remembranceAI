import { NextResponse } from "next/server";
import { z } from "zod";

import type { Persona } from "@shared/types";
import { simulateAgentReply, textToSpeech } from "@/lib/elevenlabs";
import { rowToPersona } from "@/lib/personaMapper";
import { getServiceSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  persona_id: z.string().uuid(),
  occasion: z.string().min(2).max(300),
  recipient_name: z.string().min(1).max(120).optional(),
  include_audio: z.boolean().optional().default(false),
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

  const persona = await loadPersona(parsed.data.persona_id);
  if (!persona) {
    return NextResponse.json({ error: "persona_not_found" }, { status: 404 });
  }
  if (persona.status !== "ready") {
    return NextResponse.json(
      { error: "persona_not_ready", status: persona.status },
      { status: 409 },
    );
  }
  if (!persona.agent_id) {
    return NextResponse.json({ error: "persona_missing_agent" }, { status: 409 });
  }

  try {
    const letterPrompt = buildLetterPrompt({
      occasion: parsed.data.occasion,
      recipientName: parsed.data.recipient_name,
    });
    const { reply } = await simulateAgentReply({
      agent_id: persona.agent_id,
      user_message: letterPrompt,
    });
    const letter = sanitizeLetter(reply);

    if (!parsed.data.include_audio) {
      return NextResponse.json({ letter });
    }
    if (!persona.voice_id) {
      return NextResponse.json(
        { error: "persona_missing_voice" },
        { status: 409 },
      );
    }

    const audio = await textToSpeech({ voice_id: persona.voice_id, text: letter });
    return NextResponse.json({
      letter,
      audio_base64: audio.toString("base64"),
      audio_content_type: "audio/mpeg",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "letter_generation_failed",
        detail: err instanceof Error ? err.message : String(err),
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

function buildLetterPrompt(args: {
  occasion: string;
  recipientName?: string;
}): string {
  const recipient = args.recipientName
    ? `The letter is for ${args.recipientName}.`
    : "The letter is for me.";

  return `Please write a short personal letter for this occasion:

"""
${args.occasion.trim()}
"""

${recipient}

Write in your own voice, directly to the recipient. Make it warm, specific, and emotionally grounded. Do not include headers like "Dear" unless that feels natural, and do not add stage directions. Keep it under 250 words.`;
}

function sanitizeLetter(letter: string): string {
  return letter
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\[(?:.*?)\]/g, "")
    .trim();
}
