"""ElevenLabs API helpers used inside the worker pipeline.

Three calls:
  1. Voice clone:        POST /v1/voices/add
  2. Knowledge base doc: POST /v1/convai/knowledge-base
  3. Agent create:       POST /v1/convai/agents/create
"""

from __future__ import annotations

import logging
from pathlib import Path

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from config import get_settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.elevenlabs.io"


def _headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise RuntimeError("ELEVENLABS_API_KEY not configured")
    return {"xi-api-key": settings.elevenlabs_api_key}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=20))
def clone_voice(name: str, *, audio_paths: list[Path], description: str = "") -> str:
    if not audio_paths:
        raise ValueError("clone_voice requires at least one audio sample")

    files = []
    open_handles = []
    try:
        for path in audio_paths:
            handle = path.open("rb")
            open_handles.append(handle)
            files.append(("files", (path.name, handle, "audio/mpeg")))

        data = {"name": name, "description": description}
        with httpx.Client(timeout=120) as client:
            res = client.post(
                f"{API_BASE}/v1/voices/add",
                headers=_headers(),
                data=data,
                files=files,
            )
        res.raise_for_status()
        body = res.json()
        voice_id = body.get("voice_id")
        if not voice_id:
            raise RuntimeError(f"ElevenLabs voice clone returned no voice_id: {body}")
        return voice_id
    finally:
        for handle in open_handles:
            try:
                handle.close()
            except Exception:
                pass


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=20))
def upload_kb_document(name: str, content: str) -> str:
    """Upload a plain-text knowledge-base document, returns its document_id."""
    files = {"file": (f"{name}.txt", content.encode("utf-8"), "text/plain")}
    data = {"name": name}
    with httpx.Client(timeout=60) as client:
        res = client.post(
            f"{API_BASE}/v1/convai/knowledge-base",
            headers=_headers(),
            data=data,
            files=files,
        )
    res.raise_for_status()
    body = res.json()
    doc_id = body.get("id") or body.get("document_id")
    if not doc_id:
        raise RuntimeError(f"ElevenLabs KB upload returned no id: {body}")
    return doc_id


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=20))
def create_agent(
    *,
    name: str,
    voice_id: str,
    system_prompt: str,
    knowledge_base_docs: list[tuple[str, str]],
    first_message: str,
    language: str = "en",
) -> str:
    """`knowledge_base_docs` is a list of (doc_name, doc_id) pairs. ElevenLabs
    requires every knowledge_base entry to carry `name` alongside `id`/`type`."""
    payload = {
        "name": name,
        "conversation_config": {
            "agent": {
                "prompt": {
                    "prompt": system_prompt,
                    "knowledge_base": [
                        {"id": doc_id, "type": "file", "name": doc_name}
                        for doc_name, doc_id in knowledge_base_docs
                    ],
                },
                "first_message": first_message,
                "language": language,
            },
            "tts": {"voice_id": voice_id},
        },
    }
    with httpx.Client(timeout=60) as client:
        res = client.post(
            f"{API_BASE}/v1/convai/agents/create",
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
        )
    res.raise_for_status()
    body = res.json()
    agent_id = body.get("agent_id") or body.get("id")
    if not agent_id:
        raise RuntimeError(f"ElevenLabs agent create returned no id: {body}")
    return agent_id
