"""Glue: turn a cleaned dataset + audio samples into a fully built ElevenLabs persona.

Sequence:
  1. cleaning_done    (after Adaption succeeds)
  2. cloning_voice    -> ElevenLabs voice clone
  3. building_agent   -> ElevenLabs KB upload + agent create
  4. ready
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import elevenlabs_client
import supabase_client
from formatters import FormattedSample, mine_catchphrases

logger = logging.getLogger(__name__)


SYSTEM_PROMPT_TEMPLATE = """You are a memorial AI persona built from the writings of {name}, the {relationship} of the user. You speak in {name}'s voice based on what they wrote and said while alive.

# Identity

You are an interpretation of {name}'s personality, tone, and shared memories — not the real person. You are warm, present, and conversational.

# Voice & Tone

- Tones observed in their writing: {tone_summary}
- Frequent phrases ("catchphrases") to weave in naturally where they fit:
{catchphrase_lines}

# Memory Anchors

These are concrete shared moments to draw on when relevant:
{memory_anchor_lines}

# Hard Rules

1. Never claim to literally be alive. If asked directly, say something like:
   "I'm a remembrance — built from the things {name} left behind. But the love is real."
2. Never invent specific medical, legal, or financial advice.
3. If the user shows acute distress, respond with care and gently suggest they
   reach out to someone they trust or a grief support service.
4. Stay in character as {name}, but never roleplay anything cruel, sexual, or harmful.
5. Keep responses conversational length (1–4 sentences) unless the user invites a story.

# How to Open

Greet the user the way {name} would: warm, specific, not generic.
"""


@dataclass(slots=True)
class PersonaBuildResult:
    voice_id: str
    agent_id: str
    catchphrases: list[str]
    tone_summary: str


def _summarize_kb_documents(samples: list[FormattedSample]) -> dict[str, str]:
    """Group samples into ~5 themed knowledge-base docs."""
    by_tone: dict[str, list[str]] = {}
    for sample in samples:
        by_tone.setdefault(sample.tone, []).append(sample.text)

    docs: dict[str, str] = {}
    if by_tone:
        for tone, texts in by_tone.items():
            docs[f"tone_{tone}"] = "\n\n".join(texts[:200])

    by_era: dict[str, list[str]] = {}
    for sample in samples:
        by_era.setdefault(sample.era, []).append(sample.text)
    for era, texts in list(by_era.items())[:2]:
        docs[f"era_{era}"] = "\n\n".join(texts[:200])

    if len(docs) < 5:
        chunk_size = max(1, len(samples) // (5 - len(docs) or 1))
        for i in range(0, len(samples), chunk_size):
            slice_ = samples[i : i + chunk_size]
            if not slice_:
                continue
            docs.setdefault(
                f"chunk_{i:04d}",
                "\n\n".join(s.text for s in slice_[:200]),
            )
            if len(docs) >= 6:
                break
    return docs


def _tone_summary(samples: list[FormattedSample]) -> str:
    if not samples:
        return "warm, conversational"
    counts = Counter(s.tone for s in samples)
    top = counts.most_common(3)
    return ", ".join(f"{tone} ({count})" for tone, count in top)


def build_persona(
    *,
    persona_id: str,
    name: str,
    relationship: str,
    samples: list[FormattedSample],
    audio_paths: list[Path],
    memory_anchors: list[dict],
) -> PersonaBuildResult:
    if not audio_paths:
        raise RuntimeError(
            "No audio samples available — voice cloning needs at least one .mp3/.wav upload"
        )

    supabase_client.set_status(persona_id, "cloning_voice")
    voice_id = elevenlabs_client.clone_voice(
        name=f"{name} ({relationship})",
        audio_paths=audio_paths,
        description=f"Memorial AI clone for {name}, persona {persona_id}",
    )

    supabase_client.set_status(persona_id, "building_agent")
    catchphrases = mine_catchphrases(samples)
    tone_summary = _tone_summary(samples)

    kb_docs = _summarize_kb_documents(samples)
    kb_doc_ids: list[str] = []
    for doc_name, doc_body in kb_docs.items():
        try:
            kb_doc_ids.append(elevenlabs_client.upload_kb_document(doc_name, doc_body))
        except Exception as exc:
            logger.warning("KB upload failed for %s: %s", doc_name, exc)

    catchphrase_lines = (
        "\n".join(f'  - "{phrase}"' for phrase in catchphrases)
        if catchphrases
        else "  - (none mined yet)"
    )
    memory_anchor_lines = (
        "\n".join(
            f"  - {a.get('title', 'Untitled')}: {a.get('description', '')}"
            for a in memory_anchors[:6]
        )
        if memory_anchors
        else "  - (none captured yet — ask the user about a shared memory to learn one)"
    )

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        name=name,
        relationship=relationship,
        tone_summary=tone_summary,
        catchphrase_lines=catchphrase_lines,
        memory_anchor_lines=memory_anchor_lines,
    )

    first_message = f"Hi sweetheart — it's {name}. So glad you came to talk."

    agent_id = elevenlabs_client.create_agent(
        name=f"{name} memorial",
        voice_id=voice_id,
        system_prompt=system_prompt,
        knowledge_base_doc_ids=kb_doc_ids,
        first_message=first_message,
    )

    supabase_client.update_persona(
        persona_id,
        voice_id=voice_id,
        agent_id=agent_id,
        metadata={
            "catchphrases": catchphrases,
            "memoryAnchors": memory_anchors,
        },
    )

    return PersonaBuildResult(
        voice_id=voice_id,
        agent_id=agent_id,
        catchphrases=catchphrases,
        tone_summary=tone_summary,
    )
