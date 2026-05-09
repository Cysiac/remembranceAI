"""FastAPI worker: turns raw uploads into a chattable ElevenLabs persona.

Endpoints:
  POST /jobs                 -- kick off (or restart) a persona build
  GET  /jobs/{persona_id}    -- snapshot of the personas row, FE-shaped

Auth: shared bearer secret in `Authorization: Bearer <WORKER_SHARED_SECRET>`.
The Next.js API routes hold the same secret in their env.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import traceback
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import adaption_pipeline
import persona_builder
import supabase_client
from config import get_settings
from formatters import FormattedSample, format_files, write_jsonl

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("worker")

settings = get_settings()

app = FastAPI(title="Memorial AI Worker", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JobRequest(BaseModel):
    persona_id: str = Field(..., min_length=1)
    file_keys: list[str] = Field(default_factory=list)


class JobAcceptedResponse(BaseModel):
    persona_id: str
    accepted: bool


def require_bearer(authorization: str | None = Header(default=None)) -> None:
    if not settings.worker_shared_secret:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != settings.worker_shared_secret:
        raise HTTPException(status_code=403, detail="Invalid bearer token")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/jobs",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def kick_job(
    body: JobRequest,
    background: BackgroundTasks,
    _: None = Depends(require_bearer),
) -> JobAcceptedResponse:
    background.add_task(_run_job_safely, body.persona_id, body.file_keys)
    return JobAcceptedResponse(persona_id=body.persona_id, accepted=True)


@app.get("/jobs/{persona_id}")
def get_job(persona_id: str, _: None = Depends(require_bearer)) -> dict[str, Any]:
    row = supabase_client.get_persona(persona_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"persona {persona_id} not found")
    return _row_to_persona_response(row)


def _row_to_persona_response(row: dict[str, Any]) -> dict[str, Any]:
    metadata = row.get("metadata") or {}
    return {
        "id": row["id"],
        "name": row.get("name", ""),
        "relationship": row.get("relationship", ""),
        "status": row.get("status", "uploading"),
        "voice_id": row.get("voice_id"),
        "agent_id": row.get("agent_id"),
        "dataset_id": row.get("dataset_id"),
        "metadata": {
            "catchphrases": metadata.get("catchphrases", []),
            "memoryAnchors": metadata.get("memoryAnchors", []),
            "eraTags": metadata.get("eraTags", []),
            "systemPrompt": metadata.get("systemPrompt"),
            "firstMessage": metadata.get("firstMessage"),
            "toneSummary": metadata.get("toneSummary"),
        },
        "errorMessage": row.get("error_message"),
        "createdAt": row.get("created_at"),
    }


async def _run_job_safely(persona_id: str, file_keys: list[str]) -> None:
    try:
        await _run_job(persona_id, file_keys)
    except Exception as exc:  # pragma: no cover - safety net
        logger.error("Job failed for persona %s: %s\n%s", persona_id, exc, traceback.format_exc())
        try:
            supabase_client.set_status(persona_id, "error", error=str(exc)[:500])
        except Exception:
            logger.exception("Failed to mark persona %s errored", persona_id)


_AUDIO_SUFFIXES = {".mp3", ".wav", ".m4a", ".ogg", ".flac"}
_TEXT_SUFFIXES = {".txt", ".md", ".eml", ".json"}


async def _run_job(persona_id: str, file_keys: list[str]) -> None:
    persona = supabase_client.get_persona(persona_id)
    if not persona:
        logger.error("Persona %s not found, skipping job", persona_id)
        return

    relationship = persona.get("relationship", "loved one")
    workdir = Path(tempfile.mkdtemp(prefix=f"persona-{persona_id}-"))
    logger.info("Persona %s working dir: %s", persona_id, workdir)

    try:
        supabase_client.set_status(persona_id, "cleaning")

        local_paths: list[Path] = []
        for key in file_keys:
            safe = key.replace("/", "_")
            dest = workdir / "raw" / safe
            dest.parent.mkdir(parents=True, exist_ok=True)
            await supabase_client.download_to(key, str(dest))
            local_paths.append(dest)

        text_paths = [p for p in local_paths if p.suffix.lower() in _TEXT_SUFFIXES]
        audio_paths = [p for p in local_paths if p.suffix.lower() in _AUDIO_SUFFIXES]

        samples = format_files(text_paths, relationship=relationship)
        if not samples:
            raise RuntimeError("No usable text samples after formatting")

        jsonl_path = write_jsonl(samples, workdir / "input.jsonl")

        adaption_result = await asyncio.to_thread(
            adaption_pipeline.run_pipeline,
            jsonl_path,
            output_dir=workdir / "cleaned",
        )
        supabase_client.update_persona(
            persona_id, dataset_id=adaption_result.dataset_id
        )
        cleaned_rows = adaption_pipeline.load_cleaned_samples(
            adaption_result.cleaned_jsonl_path
        )
        cleaned_samples = _samples_from_cleaned_rows(
            cleaned_rows,
            relationship=relationship,
        )
        if cleaned_samples:
            samples = cleaned_samples

        persona_builder.build_persona(
            persona_id=persona_id,
            name=persona.get("name", "your loved one"),
            relationship=relationship,
            samples=samples,
            audio_paths=audio_paths,
            memory_anchors=persona.get("metadata", {}).get("memoryAnchors", []),
        )

        supabase_client.set_status(persona_id, "ready")
        logger.info("Persona %s ready", persona_id)
    finally:
        if not os.environ.get("KEEP_WORKER_TMP"):
            shutil.rmtree(workdir, ignore_errors=True)


def _samples_from_cleaned_rows(
    rows: list[dict],
    *,
    relationship: str,
) -> list[FormattedSample]:
    samples: list[FormattedSample] = []
    for row in rows:
        context = row.get("context") if isinstance(row.get("context"), dict) else {}
        text = str(
            row.get("text")
            or row.get("completion")
            or row.get("response")
            or row.get("output")
            or ""
        ).strip()
        if len(text) < 8:
            continue
        samples.append(
            FormattedSample(
                text=text,
                tone=str(row.get("tone") or context.get("tone") or "neutral"),
                era=str(row.get("era") or context.get("era") or "unknown"),
                relationship=str(
                    row.get("relationship")
                    or context.get("relationship")
                    or relationship
                ),
            )
        )
    return samples
