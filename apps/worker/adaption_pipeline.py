"""Wraps the Adaption Lab Python SDK for the cleaning/augmentation pass.

Mirrors the pattern from the plan:

    dataset = client.datasets.create_from_files(files=[jsonl_path])
    job = client.datasets.run(
        dataset.dataset_id,
        column_mapping={
            "completion": "text",
            "context": ["tone", "era", "relationship"],
        },
    )
    while client.datasets.get(dataset.dataset_id).status != "succeeded":
        time.sleep(10)
    client.datasets.download(dataset.dataset_id)

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


def _has_sdk() -> bool:
    try:
        import adaption  # type: ignore  # noqa: F401
        return True
    except Exception:
        return False


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

    if not settings.adaption_api_key or not _has_sdk():
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

    from adaption import AdaptionClient  # type: ignore

    client = AdaptionClient(api_key=settings.adaption_api_key)
    dataset = client.datasets.create_from_files(files=[str(jsonl_path)])
    dataset_id: str = dataset.dataset_id  # type: ignore[attr-defined]

    client.datasets.run(
        dataset_id,
        column_mapping={
            "completion": "text",
            "context": ["tone", "era", "relationship"],
        },
    )

    deadline = time.monotonic() + max_wait_seconds
    while True:
        info = client.datasets.get(dataset_id)
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
    download_target = client.datasets.download(dataset_id)
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
