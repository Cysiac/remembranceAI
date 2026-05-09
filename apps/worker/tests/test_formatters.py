import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from formatters import (  # noqa: E402
    detect_era,
    detect_tone,
    format_files,
    mine_catchphrases,
    split_into_messages,
    write_jsonl,
)


def test_detect_tone_warm() -> None:
    assert detect_tone("My dear sweetheart, miss you so much") == "warm"


def test_detect_tone_neutral_when_no_keywords() -> None:
    assert detect_tone("The cardinals are back today.") == "neutral"


def test_detect_era_picks_decade() -> None:
    assert detect_era("It was the summer of 1972 at the lake") == "1970s"
    assert detect_era("nothing dated here") == "unknown"


def test_split_into_messages_paragraphs() -> None:
    raw = "First paragraph.\n\nSecond paragraph.\n\nThird."
    chunks = split_into_messages(raw)
    assert chunks == ["First paragraph.", "Second paragraph.", "Third."]


def test_format_files_text(tmp_path: Path) -> None:
    sample = tmp_path / "letter.txt"
    sample.write_text(
        "My dearest, remember the lake house?\n\nAll my love, Grandma",
        encoding="utf-8",
    )
    samples = format_files([sample], relationship="grandmother")
    assert samples
    assert samples[0].relationship == "grandmother"


def test_format_files_json(tmp_path: Path) -> None:
    sample = tmp_path / "msgs.json"
    sample.write_text(
        json.dumps(
            {
                "messages": [
                    {"text": "Don't forget your scarf, sweetheart.", "sent_at": "2018-11-04T08:12:00Z"},
                    {"text": "tiny"},  # too short, should be skipped
                ]
            }
        ),
        encoding="utf-8",
    )
    samples = format_files([sample], relationship="grandmother")
    assert len(samples) == 1
    assert samples[0].era == "2010s"


def test_write_jsonl_round_trip(tmp_path: Path) -> None:
    sample = tmp_path / "letter.txt"
    sample.write_text(
        "Dear sweetheart, remember the lake house? Bring the green coat.",
        encoding="utf-8",
    )
    samples = format_files([sample], relationship="grandmother")
    dest = tmp_path / "out.jsonl"
    write_jsonl(samples, dest)
    rows = [json.loads(line) for line in dest.read_text().splitlines() if line.strip()]
    assert rows
    assert "context" in rows[0]
    assert rows[0]["context"]["relationship"] == "grandmother"


def test_mine_catchphrases_finds_repeated_phrase() -> None:
    class Fake:
        def __init__(self, text: str) -> None:
            self.text = text

    samples = [
        Fake("Going to the lake house this weekend?"),  # type: ignore[list-item]
        Fake("Lake house in June, like always."),  # type: ignore[list-item]
        Fake("Bring the green coat to the lake house."),  # type: ignore[list-item]
        Fake("Lake house weekends were the best."),  # type: ignore[list-item]
    ]
    phrases = mine_catchphrases(samples)  # type: ignore[arg-type]
    assert any("lake house" in p for p in phrases), phrases
