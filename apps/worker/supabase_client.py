"""Thin wrapper around Supabase: persona row updates + signed-URL downloads."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from supabase import Client, create_client

from config import get_settings

logger = logging.getLogger(__name__)


def _client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase credentials are missing")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_persona(persona_id: str) -> dict[str, Any] | None:
    client = _client()
    res = (
        client.table("personas").select("*").eq("id", persona_id).single().execute()
    )
    return res.data if res and res.data else None


def update_persona(persona_id: str, **fields: Any) -> None:
    """Patch the personas row. Logs and raises on failure."""
    if not fields:
        return
    client = _client()
    res = client.table("personas").update(fields).eq("id", persona_id).execute()
    if getattr(res, "data", None) is None:
        logger.warning("update_persona returned no data for %s: %s", persona_id, res)


def set_status(persona_id: str, status: str, *, error: str | None = None) -> None:
    payload: dict[str, Any] = {"status": status}
    if error is not None:
        payload["error_message"] = error
    update_persona(persona_id, **payload)


def signed_url_for(file_key: str, *, bucket: str = "uploads", expires_in: int = 3600) -> str:
    client = _client()
    res = client.storage.from_(bucket).create_signed_url(file_key, expires_in)
    url = res.get("signedURL") if isinstance(res, dict) else None
    if not url:
        raise RuntimeError(f"Could not sign URL for {bucket}/{file_key}: {res}")
    return url


async def download_to(file_key: str, dest_path: str, *, bucket: str = "uploads") -> str:
    """Download a Supabase Storage object to local disk; returns the local path."""
    url = signed_url_for(file_key, bucket=bucket)
    async with httpx.AsyncClient(timeout=60) as http:
        resp = await http.get(url)
        resp.raise_for_status()
        with open(dest_path, "wb") as fh:
            fh.write(resp.content)
    return dest_path
