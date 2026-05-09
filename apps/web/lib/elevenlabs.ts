/**
 * Server-side ElevenLabs helpers used by the BE-owned API routes.
 *
 * The *worker* handles the heavy persona-build calls (voice clone, KB upload,
 * Conv AI agent create) directly in Python. This module covers the calls the
 * web layer needs: text-to-speech with a cloned voice, plus a thin agent
 * "simulate conversation" wrapper for in-character script generation.
 */

import { Buffer } from "node:buffer";

const API_BASE = "https://api.elevenlabs.io";

export interface ElevenLabsErrorPayload {
  status: string;
  message?: string;
}

export class ElevenLabsError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ElevenLabsError";
    this.status = status;
    this.payload = payload;
  }
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured on the server");
  return key;
}

async function ensureOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    try {
      payload = await res.text();
    } catch {
      payload = null;
    }
  }
  throw new ElevenLabsError(
    `ElevenLabs ${label} failed: ${res.status} ${res.statusText}`,
    res.status,
    payload,
  );
}

export interface TtsOptions {
  voice_id: string;
  text: string;
  model_id?: string;
  output_format?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

/**
 * Synthesize text into an audio Buffer using a cloned voice. Default output
 * format is `mp3_44100_128` (mp3, 44.1 kHz, 128 kbps) which `ffmpeg` can mux
 * directly into an mp4.
 */
export async function textToSpeech(opts: TtsOptions): Promise<Buffer> {
  const {
    voice_id,
    text,
    model_id = "eleven_multilingual_v2",
    output_format = "mp3_44100_128",
    voice_settings,
  } = opts;

  const url = new URL(`/v1/text-to-speech/${voice_id}`, API_BASE);
  url.searchParams.set("output_format", output_format);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id,
      voice_settings: voice_settings ?? {
        stability: 0.45,
        similarity_boost: 0.85,
        style: 0.25,
        use_speaker_boost: true,
      },
    }),
    cache: "no-store",
  });
  await ensureOk(res, "text-to-speech");

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface SimulateConversationMessage {
  role: "user" | "agent";
  message: string;
}

export interface SimulateConversationResult {
  reply: string;
  raw: unknown;
}

/**
 * Ask a Conversational AI agent to respond to a single user message in
 * character. We wrap ElevenLabs' "simulate conversation" endpoint, which lets
 * us drive the agent over text-only without launching the WebRTC widget.
 */
export async function simulateAgentReply(args: {
  agent_id: string;
  user_message: string;
  history?: SimulateConversationMessage[];
}): Promise<SimulateConversationResult> {
  const { agent_id, user_message, history = [] } = args;

  const url = new URL(
    `/v1/convai/agents/${agent_id}/simulate-conversation`,
    API_BASE,
  );

  const simulation_specification = {
    simulated_user_config: {
      first_message: user_message,
      prompt: { prompt: user_message },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      simulation_specification,
      conversation_history: history,
    }),
    cache: "no-store",
  });
  await ensureOk(res, "simulate-conversation");

  const data = (await res.json()) as Record<string, unknown>;
  const reply = extractAgentReply(data);
  return { reply, raw: data };
}

function extractAgentReply(data: Record<string, unknown>): string {
  const transcript = (data.transcript ?? data.simulated_conversation) as
    | Array<Record<string, unknown>>
    | undefined;
  if (Array.isArray(transcript)) {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const turn = transcript[i];
      const role = String(turn.role ?? turn.speaker ?? "");
      if (role === "agent" || role === "assistant") {
        const text = (turn.message ?? turn.content ?? turn.text) as string | undefined;
        if (text) return text;
      }
    }
  }
  if (typeof data.reply === "string") return data.reply;
  if (typeof data.response === "string") return data.response;
  throw new ElevenLabsError(
    "Could not find an agent reply in simulate-conversation response",
    500,
    data,
  );
}
