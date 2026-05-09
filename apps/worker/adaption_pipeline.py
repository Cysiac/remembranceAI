"""Wraps the Adaption Lab Python SDK for the cleaning/augmentation pass.

Mirrors the pattern from the plan:

    upload = client.datasets.upload_file(jsonl_path)
    dataset_id = upload.dataset_id
    job = client.datasets.run(
        dataset_id,
        column_mapping={
            "prompt": "prompt",
            "completion": "text",
            "context": ["tone", "era", "relationship"],
        },
    )
    while client.datasets.get_status(dataset_id).status != "succeeded":
        time.sleep(10)
    client.datasets.download(dataset_id, file_format="jsonl")

The SDK is optional: if it's missing or the API key is empty we fall back to
treating the local JSONL as the cleaned dataset. That keeps the pipeline
runnable for fixtures and the demo.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path

from config import get_settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AdaptionResult:
    dataset_id: str
    cleaned_jsonl_path: Path
    used_fallback: bool


def _adaption_client_class() -> type | None:
    """Return the client class exposed by the installed Adaption SDK.

    The current SDK exposes `Adaption` / `Client`; older snippets referenced
    `AdaptionClient`. Accept all known names but require the dataset helpers we
    actually call.
    """
    try:
        import adaption  # type: ignore
    except Exception:
        return None

    for name in ("Adaption", "Client", "AdaptionClient"):
        client_cls = getattr(adaption, name, None)
        if client_cls is None:
            continue
        try:
            client = client_cls(api_key="sdk-shape-check")
            datasets = getattr(client, "datasets", None)
        except Exception:
            continue
        if all(
            hasattr(datasets, method)
            for method in ("upload_file", "run", "get_status", "download")
        ):
            return client_cls
    return None


def run_pipeline(
    jsonl_path: Path,
    *,
    output_dir: Path,
    poll_seconds: float = 10.0,
    max_wait_seconds: float = 1800.0,
) -> AdaptionResult:
    """Submit jsonl_path to Adaption, poll until succeeded, download cleaned JSONL.

    Returns an AdaptionResult pointing at the cleaned file and the dataset id.
    """
    settings = get_settings()
    output_dir.mkdir(parents=True, exist_ok=True)

    client_cls = _adaption_client_class()
    if not settings.adaption_api_key or client_cls is None:
        logger.warning(
            "Adaption SDK or key missing — using raw JSONL as cleaned dataset"
        )
        cleaned = output_dir / "cleaned.jsonl"
        cleaned.write_bytes(jsonl_path.read_bytes())
        return AdaptionResult(
            dataset_id=f"local-{jsonl_path.stem}",
            cleaned_jsonl_path=cleaned,
            used_fallback=True,
        )

    client = client_cls(api_key=settings.adaption_api_key)
    upload_path = _write_adaption_input(
        jsonl_path,
        output_dir / "adaption_input.jsonl",
    )
    upload = client.datasets.upload_file(
        str(upload_path),
        name=f"memorial-{jsonl_path.stem}",
    )
    dataset_id: str = upload.dataset_id  # type: ignore[attr-defined]

    client.datasets.run(
        dataset_id,
        column_mapping={
            "prompt": "prompt",
            "completion": "text",
            "context": ["tone", "era", "relationship"],
        },
    )

    deadline = time.monotonic() + max_wait_seconds
    while True:
        info = client.datasets.get_status(dataset_id)
        status = getattr(info, "status", "unknown")
        if status == "succeeded":
            break
        if status in {"failed", "error"}:
            raise RuntimeError(f"Adaption job {dataset_id} failed: {info}")
        if time.monotonic() > deadline:
            raise TimeoutError(f"Adaption job {dataset_id} did not complete in time")
        logger.info("Adaption dataset %s status=%s, sleeping", dataset_id, status)
        time.sleep(poll_seconds)

    cleaned = output_dir / "cleaned.jsonl"
    download_target = client.datasets.download(dataset_id, file_format="jsonl")
    if hasattr(download_target, "save"):
        download_target.save(str(cleaned))
    elif isinstance(download_target, (bytes, bytearray)):
        cleaned.write_bytes(download_target)
    elif isinstance(download_target, str):
        cleaned.write_text(download_target, encoding="utf-8")
    else:
        cleaned.write_text(json.dumps(download_target, ensure_ascii=False), encoding="utf-8")

    return AdaptionResult(
        dataset_id=dataset_id,
        cleaned_jsonl_path=cleaned,
        used_fallback=False,
    )


def _write_adaption_input(src: Path, dest: Path) -> Path:
    """Flatten our local JSONL into the schema expected by Adaption's run API."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with src.open("r", encoding="utf-8") as in_fh, dest.open(
        "w",
        encoding="utf-8",
    ) as out_fh:
        for line in in_fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                continue
            context = row.get("context") if isinstance(row.get("context"), dict) else {}
            text = str(row.get("text") or "").strip()
            if not text:
                continue
            out_fh.write(
                json.dumps(
                    {
                        "prompt": (
                            "Write in this person's voice, using the provided "
                            "tone and relationship context."
                        ),
                        "text": text,
                        "tone": str(
                            context.get("tone") or row.get("tone") or "neutral"
                        ),
                        "era": str(context.get("era") or row.get("era") or "unknown"),
                        "relationship": str(
                            context.get("relationship")
                            or row.get("relationship")
                            or "loved one"
                        ),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    return dest


def load_cleaned_samples(cleaned_jsonl_path: Path) -> list[dict]:
    """Read the cleaned JSONL back into memory for downstream prompt-building."""
    rows: list[dict] = []
    with cleaned_jsonl_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                logger.warning("Skipping malformed JSONL line in %s", cleaned_jsonl_path)
    return rows
