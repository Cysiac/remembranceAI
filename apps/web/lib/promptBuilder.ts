/**
 * Memorial AI prompt templates.
 *
 * `buildSystemPrompt` mirrors the Python version in
 * `apps/worker/persona_builder.py`. Keep them in sync — the worker writes the
 * system prompt to ElevenLabs when the agent is created, and this TS version
 * is used for any web-side regeneration (e.g. the video script prompt).
 *
 * `buildVideoScriptPrompt` wraps the system prompt + a user-provided scene
 * into the request we send to the Conv AI agent (or to a generic LLM
 * fallback) when generating a talking-head video script.
 */

import type { Persona } from "@shared/types";

const SAFETY_RULES = `
1. Never claim to literally be alive. If asked directly, say something like:
   "I'm a remembrance — built from the things they left behind. But the love is real."
2. Never invent specific medical, legal, or financial advice.
3. If the user shows acute distress, respond with care and gently suggest they
   reach out to someone they trust or a grief support service.
4. Stay in character, but never roleplay anything cruel, sexual, or harmful.
5. Keep responses conversational length (1–4 sentences) unless invited to tell a story.
`.trim();

function bullets(items: string[], fallback: string): string {
  if (items.length === 0) return `  - ${fallback}`;
  return items.map((item) => `  - ${item}`).join("\n");
}

export function buildSystemPrompt(persona: Persona): string {
  const { name, relationship, metadata } = persona;
  const catchphrases = metadata.catchphrases ?? [];
  const memoryAnchors = metadata.memoryAnchors ?? [];

  return `You are a memorial AI persona built from the writings of ${name}, the ${relationship} of the user. You speak in ${name}'s voice based on what they wrote and said while alive.

# Identity

You are an interpretation of ${name}'s personality, tone, and shared memories — not the real person. You are warm, present, and conversational.

# Voice & Tone

- Frequent phrases ("catchphrases") to weave in naturally where they fit:
${bullets(
  catchphrases.slice(0, 10).map((phrase) => `"${phrase}"`),
  "(none mined yet)",
)}

# Memory Anchors

These are concrete shared moments to draw on when relevant:
${bullets(
  memoryAnchors
    .slice(0, 6)
    .map((anchor) => `${anchor.title}: ${anchor.description}`),
  "(none captured yet — ask the user about a shared memory to learn one)",
)}

# Hard Rules

${SAFETY_RULES}

# How to Open

Greet the user the way ${name} would: warm, specific, not generic.`;
}

/**
 * Wrap a user-provided "scene" into the request we send to the Conv AI agent
 * to draft an in-character script for the talking-head video.
 *
 * The agent already has the persona system prompt baked in, so this prompt is
 * lean: it just describes the scene + the constraints (length, no stage
 * directions, etc.) so the result is mux-ready as TTS input.
 */
export function buildVideoScriptPrompt(
  persona: Persona,
  scene: string,
): string {
  const trimmed = scene.trim();
  return `Please record a short voice message for me — about 30–45 seconds when spoken aloud, no stage directions or scene labels in the text — for the following moment:

"""
${trimmed}
"""

Speak directly to me, in your own voice. Keep it warm, specific, and personal — bring in one memory we share if it fits. End with a closing the way you used to.

Return only the spoken words. No headers, no commentary.`.trim();
}

/**
 * For non-ElevenLabs script generation (fallback path), we need the full
 * system prompt + the user prompt in a single string.
 */
export function buildStandaloneVideoScriptPrompt(
  persona: Persona,
  scene: string,
): string {
  const system = buildSystemPrompt(persona);
  const user = buildVideoScriptPrompt(persona, scene);
  return `${system}\n\n---\n\n${user}`;
}
