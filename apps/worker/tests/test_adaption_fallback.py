import json
import sys
import types
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import adaption_pipeline  # noqa: E402


def test_run_pipeline_falls_back_when_no_api_key(tmp_path: Path, monkeypatch) -> None:
    adaption_pipeline.get_settings.cache_clear()
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


def test_run_pipeline_uses_current_adaption_sdk_shape(
    tmp_path: Path,
    monkeypatch,
) -> None:
    adaption_pipeline.get_settings.cache_clear()
    monkeypatch.setenv("ADAPTION_API_KEY", "test-key")

    calls: dict[str, object] = {}

    class FakeDatasets:
        def upload_file(self, path: str, *, name: str | None = None) -> SimpleNamespace:
            calls["upload_name"] = name
            rows = [
                json.loads(line)
                for line in Path(path).read_text(encoding="utf-8").splitlines()
            ]
            calls["upload_rows"] = rows
            return SimpleNamespace(dataset_id="ds_123")

        def run(self, dataset_id: str, *, column_mapping: dict) -> None:
            calls["run"] = (dataset_id, column_mapping)

        def get_status(self, dataset_id: str) -> SimpleNamespace:
            calls["status_dataset_id"] = dataset_id
            return SimpleNamespace(status="succeeded")

        def download(self, dataset_id: str, *, file_format: str) -> str:
            calls["download"] = (dataset_id, file_format)
            return (
                '{"text": "Hi sweetheart", "tone": "warm", "era": "2020s", '
                '"relationship": "grandmother"}\n'
            )

    class FakeAdaption:
        def __init__(self, *, api_key: str) -> None:
            calls["api_key"] = api_key
            self.datasets = FakeDatasets()

    monkeypatch.setitem(
        sys.modules,
        "adaption",
        types.SimpleNamespace(Adaption=FakeAdaption),
    )

    src = tmp_path / "input.jsonl"
    src.write_text(
        json.dumps(
            {
                "text": "Hi sweetheart",
                "context": {
                    "tone": "warm",
                    "era": "2020s",
                    "relationship": "grandmother",
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )

    result = adaption_pipeline.run_pipeline(src, output_dir=tmp_path / "out")

    assert result.used_fallback is False
    assert result.dataset_id == "ds_123"
    assert calls["api_key"] == "test-key"
    assert calls["run"] == (
        "ds_123",
        {
            "prompt": "prompt",
            "completion": "text",
            "context": ["tone", "era", "relationship"],
        },
    )
    assert calls["download"] == ("ds_123", "jsonl")
    assert calls["upload_rows"] == [
        {
            "prompt": (
                "Write in this person's voice, using the provided "
                "tone and relationship context."
            ),
            "text": "Hi sweetheart",
            "tone": "warm",
            "era": "2020s",
            "relationship": "grandmother",
        }
    ]
    assert result.cleaned_jsonl_path.read_text(encoding="utf-8") == (
        '{"text": "Hi sweetheart", "tone": "warm", "era": "2020s", '
        '"relationship": "grandmother"}\n'
    )


def test_load_cleaned_samples_skips_blank_lines(tmp_path: Path) -> None:
    cleaned = tmp_path / "cleaned.jsonl"
    cleaned.write_text(
        '{"text": "hi"}\n\n{"text": "there"}\n',
        encoding="utf-8",
    )
    rows = adaption_pipeline.load_cleaned_samples(cleaned)
    assert rows == [{"text": "hi"}, {"text": "there"}]
