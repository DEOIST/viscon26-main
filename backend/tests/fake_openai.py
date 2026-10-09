"""Test doubles for the OpenAI SDK client: same attribute paths and response shapes as the real
`openai.OpenAI`, no network. Each fake records the keyword arguments of every call."""

from collections.abc import Callable
from types import SimpleNamespace

import httpx2
import openai
import pytest
from pydantic import BaseModel, SecretStr

from app import ai
from app.config import settings

REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/responses")


def status_error(error_class: type[openai.APIStatusError], status: int, code: str, kind: str):
    """An SDK error exactly as the client raises it: `body` is the inner `error` object."""
    body = {"message": f"{code} (fake)", "type": kind, "param": None, "code": code}
    return error_class(
        f"Error code: {status}", response=httpx2.Response(status, request=REQUEST), body=body
    )


def credit_exhausted() -> openai.RateLimitError:
    return status_error(
        openai.RateLimitError, 429, "credit_balance_exhausted", "insufficient_quota"
    )


def rate_limited() -> openai.RateLimitError:
    return status_error(openai.RateLimitError, 429, "rate_limit_exceeded", "requests")


def invalid_key() -> openai.AuthenticationError:
    return status_error(openai.AuthenticationError, 401, "invalid_api_key", "invalid_request_error")


def usage(input_tokens: int = 120, output_tokens: int = 80) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
    )


def text_response(text: str) -> SimpleNamespace:
    return SimpleNamespace(id="resp_fake", model="gpt-fake", output_text=text, usage=usage())


def parsed_response(parsed: BaseModel | None) -> SimpleNamespace:
    return SimpleNamespace(
        id="resp_fake",
        model="gpt-fake",
        output_parsed=parsed,
        output_text=parsed.model_dump_json() if parsed else "",
        usage=usage(),
    )


class _Endpoint:
    """One SDK method: returns (or raises) the next scripted outcome; the last one repeats."""

    def __init__(self, *outcomes: object) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict] = []

    def __call__(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        if not self.outcomes:
            raise AssertionError("Unexpected OpenAI call")
        outcome = self.outcomes.pop(0) if len(self.outcomes) > 1 else self.outcomes[0]
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class FakeOpenAI:
    def __init__(
        self,
        *,
        text: tuple[object, ...] = (),
        parse: tuple[object, ...] = (),
        speech: tuple[object, ...] = (),
        moderation: tuple[object, ...] = (),
        models: tuple[object, ...] = (),
    ) -> None:
        self.responses = SimpleNamespace(create=_Endpoint(*text), parse=_Endpoint(*parse))
        self.audio = SimpleNamespace(speech=SimpleNamespace(create=_Endpoint(*speech)))
        self.moderations = SimpleNamespace(create=_Endpoint(*moderation))
        self.models = SimpleNamespace(list=_Endpoint(*models))

    @property
    def call_count(self) -> int:
        endpoints = (
            self.responses.create,
            self.responses.parse,
            self.audio.speech.create,
            self.moderations.create,
            self.models.list,
        )
        return sum(len(endpoint.calls) for endpoint in endpoints)


def speech_response(audio: bytes) -> SimpleNamespace:
    return SimpleNamespace(content=audio)


def moderation_response(flagged: bool) -> SimpleNamespace:
    return SimpleNamespace(id="modr_fake", results=[SimpleNamespace(flagged=flagged)])


def model_list(*ids: str) -> list[SimpleNamespace]:
    return [SimpleNamespace(id=model_id, object="model", owned_by="openai") for model_id in ids]


def use_live_clients(monkeypatch: pytest.MonkeyPatch, *clients: FakeOpenAI) -> list[str]:
    """Live mode with one fake key per client, in chain order. Returns the (fake) key strings."""
    keys = [f"sk-test-{index}{index}{index}{index}" for index in range(1, len(clients) + 1)]
    by_key = dict(zip(keys, clients, strict=True))
    monkeypatch.setattr(settings, "ai_mode", "live")
    monkeypatch.setattr(settings, "openai_api_keys", [SecretStr(key) for key in keys])
    factory: Callable[[str], FakeOpenAI] = by_key.__getitem__
    monkeypatch.setattr(ai, "_client", factory)
    return keys


def forbid_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    """Any attempt to create an OpenAI client fails the test."""

    def refuse(_api_key: str) -> FakeOpenAI:
        raise AssertionError("An OpenAI client was created")

    monkeypatch.setattr(ai, "_client", refuse)
