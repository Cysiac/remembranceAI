import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import adaption_pipeline  # noqa: E402


def test_run_pipeline_falls_back_when_no_api_key(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ADAPTION_API_KEY", "")

    src = tmp_path / "input.jsonl"
    src.write_text(
        json.dumps(
            {"text": "Hi sweetheart", "context": {"tone": "warm", "era": "2010s", "relationship": "grandmother"}}
        )
        + "\n",
        encoding="utf-8",
    )

    result = adaption_pipeline.run_pipeline(src, output_dir=tmp_path / "out")

    assert result.used_fallback is True
    assert result.cleaned_jsonl_path.exists()
    assert result.cleaned_jsonl_path.read_text(encoding="utf-8") == src.read_text(encoding="utf-8")


def test_load_cleaned_samples_skips_blank_lines(tmp_path: Path) -> None:
    cleaned = tmp_path / "cleaned.jsonl"
    cleaned.write_text(
        '{"text": "hi"}\n\n{"text": "there"}\n',
        encoding="utf-8",
    )
    rows = adaption_pipeline.load_cleaned_samples(cleaned)
    assert rows == [{"text": "hi"}, {"text": "there"}]
