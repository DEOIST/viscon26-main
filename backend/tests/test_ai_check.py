import pytest

from tests.fake_openai import FakeOpenAI, invalid_key, model_list, use_live_clients
from tools import ai_check

ALL_MODELS = ("gpt-6-luna", "gpt-4o-mini-tts", "gpt-image-2.5-sunburst", "omni-moderation-latest")


def test_prints_masked_keys_and_succeeds_when_a_key_works(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    keys = use_live_clients(
        monkeypatch,
        FakeOpenAI(models=(model_list(*ALL_MODELS),)),
        FakeOpenAI(models=(invalid_key(),)),
    )

    exit_code = ai_check.main([])

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "sk-…1111  ok" in output
    assert "sk-…2222  INVALID" in output
    assert all(key not in output for key in keys)


def test_fails_when_no_key_works(monkeypatch: pytest.MonkeyPatch):
    use_live_clients(monkeypatch, FakeOpenAI(models=(invalid_key(),)))

    assert ai_check.main([]) == 1


def test_explains_how_to_add_keys_when_there_are_none(capsys: pytest.CaptureFixture[str]):
    exit_code = ai_check.main([])

    assert exit_code == 1
    assert "OPENAI_API_KEYS" in capsys.readouterr().out
