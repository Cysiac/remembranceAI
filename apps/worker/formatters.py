"""Convert raw uploads (txt, eml, json, etc.) into the Adaption JSONL schema.

Output rows match the column_mapping used in adaption_pipeline.run_pipeline:
    {"text": "...", "context": {"tone": "...", "era": "...", "relationship": "..."}}
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

logger = logging.getLogger(__name__)


_TONE_KEYWORDS = {
    "warm": {"love", "dear", "sweetheart", "miss you", "hugs"},
    "playful": {"haha", "lol", "joking", "kidding", "tease"},
    "stern": {"must", "should", "do not", "don't ", "never "},
    "wistful": {"remember", "back when", "used to", "those days"},
}


@dataclass(slots=True)
class FormattedSample:
    text: str
    tone: str
    era: str
    relationship: str

    def to_jsonl_row(self) -> dict:
        return {
            "text": self.text,
            "context": {
                "tone": self.tone,
                "era": self.era,
                "relationship": self.relationship,
            },
        }


def detect_tone(text: str) -> str:
    lowered = text.lower()
    scores = {
        tone: sum(1 for kw in keywords if kw in lowered)
        for tone, keywords in _TONE_KEYWORDS.items()
    }
    best, best_score = max(scores.items(), key=lambda item: item[1])
    return best if best_score > 0 else "neutral"


def detect_era(text: str, *, sent_at: datetime | None = None) -> str:
    if sent_at is not None:
        return f"{sent_at.year // 10 * 10}s"
    match = re.search(r"\b(19|20)\d{2}\b", text)
    if match:
        year = int(match.group(0))
        return f"{year // 10 * 10}s"
    return "unknown"


def split_into_messages(raw: str) -> list[str]:
    """Split a long blob into chunks. Prefer paragraph breaks; fall back to sentence-ish."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", raw) if p.strip()]
    if len(paragraphs) > 1:
        return paragraphs
    # Single block → split on sentence terminators.
    sentences = re.split(r"(?<=[.!?])\s+", raw.strip())
    chunks: list[str] = []
    buffer: list[str] = []
    char_count = 0
    for sent in sentences:
        buffer.append(sent)
        char_count += len(sent)
        if char_count >= 240:
            chunks.append(" ".join(buffer))
            buffer = []
            char_count = 0
    if buffer:
        chunks.append(" ".join(buffer))
    return chunks or [raw.strip()]


def from_text_file(path: Path, *, relationship: str) -> Iterable[FormattedSample]:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    for chunk in split_into_messages(raw):
        if len(chunk) < 8:
            continue
        yield FormattedSample(
            text=chunk,
            tone=detect_tone(chunk),
            era=detect_era(chunk),
            relationship=relationship,
        )


def from_eml_file(path: Path, *, relationship: str) -> Iterable[FormattedSample]:
    try:
        import mailparser  # type: ignore

        mail = mailparser.parse_from_file(str(path))
        sent_at = mail.date if isinstance(mail.date, datetime) else None
        body = "\n\n".join(
            part for part in [mail.body, *(mail.text_plain or [])] if part
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to parse %s as .eml, falling back to plain text: %s", path, exc)
        return from_text_file(path, relationship=relationship)

    if not body.strip():
        return []

    samples: list[FormattedSample] = []
    for chunk in split_into_messages(body):
        if len(chunk) < 8:
            continue
        samples.append(
            FormattedSample(
                text=chunk,
                tone=detect_tone(chunk),
                era=detect_era(chunk, sent_at=sent_at),
                relationship=relationship,
            )
        )
    return samples


def from_json_file(path: Path, *, relationship: str) -> Iterable[FormattedSample]:
    """Accepts an array of {text, sent_at?} or chat exports."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "messages" in raw:
        records = raw["messages"]
    elif isinstance(raw, list):
        records = raw
    else:
        records = [raw]

    for rec in records:
        if not isinstance(rec, dict):
            continue
        text = rec.get("text") or rec.get("body") or rec.get("content")
        if not text or len(text) < 8:
            continue
        sent_at_raw = rec.get("sent_at") or rec.get("date") or rec.get("timestamp")
        sent_at = None
        if isinstance(sent_at_raw, str):
            try:
                sent_at = datetime.fromisoformat(sent_at_raw.replace("Z", "+00:00"))
            except ValueError:
                sent_at = None
        yield FormattedSample(
            text=text,
            tone=detect_tone(text),
            era=detect_era(text, sent_at=sent_at),
            relationship=relationship,
        )


def format_files(paths: list[Path], *, relationship: str) -> list[FormattedSample]:
    samples: list[FormattedSample] = []
    for path in paths:
        suffix = path.suffix.lower()
        try:
            if suffix in {".txt", ".md"}:
                samples.extend(from_text_file(path, relationship=relationship))
            elif suffix == ".eml":
                samples.extend(from_eml_file(path, relationship=relationship))
            elif suffix == ".json":
                samples.extend(from_json_file(path, relationship=relationship))
            else:
                logger.info("Skipping non-text file %s for JSONL formatting", path)
        except Exception as exc:
            logger.warning("Skipping %s: %s", path, exc)
    return samples


def write_jsonl(samples: list[FormattedSample], dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8") as fh:
        for sample in samples:
            fh.write(json.dumps(sample.to_jsonl_row(), ensure_ascii=False) + "\n")
    return dest


_STOPWORDS = {
    "the", "and", "you", "for", "are", "with", "that", "this", "have",
    "your", "from", "but", "all", "not", "was", "were", "they", "them",
    "their", "what", "when", "will", "would", "could", "should", "about",
    "into", "than", "then", "there", "here", "just", "very", "much", "more",
    "some", "any", "any", "one", "two", "out", "got", "get", "had", "has",
    "him", "her", "she", "his", "its", "yes", "yeah", "okay", "ok", "thanks",
}


def mine_catchphrases(samples: list[FormattedSample], *, top_k: int = 10) -> list[str]:
    """Extract common 2- to 5-grams that survive a small stopword filter.

    2-grams must repeat at least 3 times to count (they're noisier);
    3+ grams need to repeat at least 2 times.
    """
    counter: Counter[str] = Counter()
    gram_lengths: dict[str, int] = {}
    for sample in samples:
        words = re.findall(r"[A-Za-z']+", sample.text.lower())
        for n in (2, 3, 4, 5):
            for i in range(len(words) - n + 1):
                gram = words[i : i + n]
                if any(w in _STOPWORDS for w in (gram[0], gram[-1])):
                    continue
                if all(len(w) <= 2 for w in gram):
                    continue
                phrase = " ".join(gram)
                counter[phrase] += 1
                gram_lengths[phrase] = n

    candidates: list[str] = []
    for phrase, count in counter.most_common(top_k * 6):
        n = gram_lengths.get(phrase, 0)
        threshold = 3 if n == 2 else 2
        if count >= threshold:
            candidates.append(phrase)
    return candidates[:top_k]
