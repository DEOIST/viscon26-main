import openai
import pytest
from pydantic import BaseModel, SecretStr

from app import ai
from app.config import settings
from tests.fake_openai import (
    REQUEST,
    FakeOpenAI,
    credit_exhausted,
    forbid_clients,
    invalid_key,
    model_list,
    moderation_response,
    parsed_response,
    rate_limited,
    speech_response,
    status_error,
    text_response,
    use_live_clients,
)


class Answer(BaseModel):
    text: str


@pytest.mark.parametrize("mode", ["off", "fake"])
def test_only_live_mode_ever_creates_a_client(monkeypatch: pytest.MonkeyPatch, mode: str):
    monkeypatch.setattr(settings, "ai_mode", mode)
    monkeypatch.setattr(settings, "openai_api_keys", [SecretStr("sk-test-1111")])
    forbid_clients(monkeypatch)

    with pytest.raises(ai.AiUnavailableError):
        ai.generate_text("Be brief.", "Hi", max_output_tokens=50)


def test_live_mode_without_keys_behaves_like_off(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_mode", "live")
    forbid_clients(monkeypatch)

    assert ai.mode() == "off"
    with pytest.raises(ai.AiUnavailableError):
        ai.generate_text("Be brief.", "Hi", max_output_tokens=50)


def test_text_comes_from_the_first_key_with_the_configured_model(
    monkeypatch: pytest.MonkeyPatch,
):
    first, second = FakeOpenAI(text=(text_response("Hello"),)), FakeOpenAI()
    use_live_clients(monkeypatch, first, second)

    assert ai.generate_text("Be brief.", "Hi", max_output_tokens=50) == "Hello"

    assert first.responses.create.calls == [
        {
            "model": "gpt-6-luna",
            "instructions": "Be brief.",
            "input": "Hi",
            "max_output_tokens": 50,
            "reasoning": {"effort": "none"},
        }
    ]
    assert second.call_count == 0


def test_an_empty_reasoning_effort_is_not_sent(monkeypatch: pytest.MonkeyPatch):
    client = FakeOpenAI(text=(text_response("Hello"),))
    use_live_clients(monkeypatch, client)
    monkeypatch.setattr(settings, "openai_reasoning_effort", "")

    ai.generate_text("Be brief.", "Hi", max_output_tokens=50)

    assert "reasoning" not in client.responses.create.calls[0]


def test_exhausted_credit_fails_over_and_the_dead_key_is_skipped_later(
    monkeypatch: pytest.MonkeyPatch,
):
    first = FakeOpenAI(text=(credit_exhausted(),))
    second = FakeOpenAI(text=(text_response("From key two"),))
    use_live_clients(monkeypatch, first, second)

    assert ai.generate_text("Be brief.", "Hi", max_output_tokens=50) == "From key two"
    assert ai.generate_text("Be brief.", "Again", max_output_tokens=50) == "From key two"

    assert len(first.responses.create.calls) == 1
    assert len(second.responses.create.calls) == 2


def test_an_invalid_key_fails_over_to_the_next(monkeypatch: pytest.MonkeyPatch):
    first = FakeOpenAI(text=(invalid_key(),))
    second = FakeOpenAI(text=(text_response("From key two"),))
    use_live_clients(monkeypatch, first, second)

    assert ai.generate_text("Be brief.", "Hi", max_output_tokens=50) == "From key two"


def test_an_ordinary_rate_limit_never_switches_keys(monkeypatch: pytest.MonkeyPatch):
    first, second = FakeOpenAI(text=(rate_limited(),)), FakeOpenAI(text=(text_response("No"),))
    use_live_clients(monkeypatch, first, second)

    with pytest.raises(ai.AiUnavailableError):
        ai.generate_text("Be brief.", "Hi", max_output_tokens=50)

    assert second.call_count == 0


@pytest.mark.parametrize(
    "error",
    [
        openai.APITimeoutError(request=REQUEST),
        openai.APIConnectionError(request=REQUEST),
        status_error(openai.InternalServerError, 500, "server_error", "server_error"),
    ],
)
def test_timeouts_and_server_errors_become_unavailable(
    monkeypatch: pytest.MonkeyPatch, error: Exception
):
    use_live_clients(monkeypatch, FakeOpenAI(text=(error,)))

    with pytest.raises(ai.AiUnavailableError):
        ai.generate_text("Be brief.", "Hi", max_output_tokens=50)


def test_when_every_key_is_dead_no_client_is_called_again(monkeypatch: pytest.MonkeyPatch):
    first, second = FakeOpenAI(text=(invalid_key(),)), FakeOpenAI(text=(credit_exhausted(),))
    use_live_clients(monkeypatch, first, second)

    for _ in range(2):
        with pytest.raises(ai.AiUnavailableError):
            ai.generate_text("Be brief.", "Hi", max_output_tokens=50)

    assert first.call_count == 1
    assert second.call_count == 1


def test_the_daily_cap_stops_calls_before_they_reach_openai(monkeypatch: pytest.MonkeyPatch):
    client = FakeOpenAI(text=(text_response("Hello"),))
    use_live_clients(monkeypatch, client)
    monkeypatch.setattr(settings, "ai_daily_call_limit", 2)

    ai.generate_text("Be brief.", "1", max_output_tokens=50)
    ai.generate_text("Be brief.", "2", max_output_tokens=50)
    with pytest.raises(ai.AiUnavailableError):
        ai.generate_text("Be brief.", "3", max_output_tokens=50)

    assert len(client.responses.create.calls) == 2


def test_structured_output_returns_the_parsed_model(monkeypatch: pytest.MonkeyPatch):
    client = FakeOpenAI(parse=(parsed_response(Answer(text="Hi there")),))
    use_live_clients(monkeypatch, client)

    answer = ai.generate_structured("Be brief.", "Hi", Answer, max_output_tokens=80)

    assert answer == Answer(text="Hi there")
    assert client.responses.parse.calls[0]["text_format"] is Answer


def test_structured_output_without_a_parsed_result_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
):
    use_live_clients(monkeypatch, FakeOpenAI(parse=(parsed_response(None),)))

    with pytest.raises(ai.AiUnavailableError):
        ai.generate_structured("Be brief.", "Hi", Answer, max_output_tokens=80)


def test_speech_returns_mp3_bytes_with_the_configured_voice(monkeypatch: pytest.MonkeyPatch):
    client = FakeOpenAI(speech=(speech_response(b"ID3-fake-mp3"),))
    use_live_clients(monkeypatch, client)

    audio = ai.generate_speech("Congratulations.", "Speak like a rector.")

    assert audio == b"ID3-fake-mp3"
    assert client.audio.speech.create.calls == [
        {
            "model": "gpt-4o-mini-tts",
            "voice": "cedar",
            "input": "Congratulations.",
            "instructions": "Speak like a rector.",
            "response_format": "mp3",
        }
    ]


@pytest.mark.parametrize("flagged", [True, False])
def test_moderation_reports_whether_text_is_flagged(monkeypatch: pytest.MonkeyPatch, flagged: bool):
    client = FakeOpenAI(moderation=(moderation_response(flagged),))
    use_live_clients(monkeypatch, client)

    assert ai.moderate("Alex") is flagged
    assert client.moderations.create.calls == [{"model": "omni-moderation-latest", "input": "Alex"}]


def test_moderation_does_not_count_toward_the_daily_cap(monkeypatch: pytest.MonkeyPatch):
    use_live_clients(monkeypatch, FakeOpenAI(moderation=(moderation_response(False),)))
    monkeypatch.setattr(settings, "ai_daily_call_limit", 0)

    assert ai.moderate("Alex") is False


ALL_MODELS = (
    "gpt-6-luna",
    "gpt-4o-mini-tts",
    "gpt-image-2.5-sunburst",
    "omni-moderation-latest",
    "gpt-5.6-luna",  # vision (avatar photo)
)


def test_key_check_masks_keys_and_never_generates_anything(monkeypatch: pytest.MonkeyPatch):
    good = FakeOpenAI(models=(model_list(*ALL_MODELS[:2], *ALL_MODELS[3:]),))
    bad = FakeOpenAI(models=(invalid_key(),))
    use_live_clients(monkeypatch, good, bad)
    monkeypatch.setattr(settings, "ai_mode", "off")  # checking keys works in every mode

    checks = ai.check_keys()

    assert checks == [
        ai.KeyCheck(key="sk-…1111", status="ok", missing_models=("gpt-image-2.5-sunburst",)),
        ai.KeyCheck(key="sk-…2222", status="invalid"),
    ]
    assert good.responses.create.calls == []


def test_live_key_check_detects_exhausted_credit(monkeypatch: pytest.MonkeyPatch):
    client = FakeOpenAI(models=(model_list(*ALL_MODELS),), text=(credit_exhausted(),))
    use_live_clients(monkeypatch, client)

    assert ai.check_keys(live=True) == [ai.KeyCheck(key="sk-…1111", status="no_credit")]
    assert client.responses.create.calls[0]["max_output_tokens"] == 16
