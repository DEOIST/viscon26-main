"""The only module that talks to OpenAI (docs/ARCHITECTURE.md → OpenAI integration).

- Only AI_MODE=live ever creates a client. In "off" and "fake" every call raises
  AiUnavailableError, and the story service decides what to show instead.
- OPENAI_API_KEYS is a failover chain: a key that is invalid or out of credit is marked dead in
  Redis for an hour and the next key is tried. An ordinary rate limit never switches keys:
  spreading load over accounts to dodge limits can breach OpenAI's terms.
- A daily call cap in Redis protects the credits if someone scripts our public endpoints.
- Logs show the purpose, the key's position in the chain, latency and token usage. Never prompt
  text, never a key.
"""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from typing import Literal

import openai
from pydantic import BaseModel

from app import db
from app.config import settings

log = logging.getLogger(__name__)

MODERATION_MODEL = "omni-moderation-latest"
DEAD_KEY_SECONDS = 3600
CALL_COUNTER_SECONDS = 2 * 24 * 3600
# Codes OpenAI uses when an account or project has no money left (429 responses).
BILLING_ERROR_CODES = frozenset(
    {
        "insufficient_quota",
        "credit_balance_exhausted",
        "organization_spend_limit_exceeded",
        "project_spend_limit_exceeded",
    }
)


class AiUnavailableError(Exception):
    """No AI answer: mode is off/fake, no usable key, cap reached or OpenAI failed. Fall back."""


def mode() -> Literal["off", "fake", "live"]:
    """The effective mode: "live" without any key behaves like "off"."""
    if settings.ai_mode == "live" and not settings.openai_api_keys:
        return "off"
    return settings.ai_mode


def generate_text(instructions: str, prompt: str, max_output_tokens: int) -> str:
    response = _call(
        "text",
        lambda client: client.responses.create(
            **_text_params(instructions, prompt, max_output_tokens)
        ),
    )
    return response.output_text


def generate_structured[ModelT: BaseModel](
    instructions: str, prompt: str, schema: type[ModelT], max_output_tokens: int
) -> ModelT:
    response = _call(
        "structured",
        lambda client: client.responses.parse(
            text_format=schema, **_text_params(instructions, prompt, max_output_tokens)
        ),
    )
    if response.output_parsed is None:
        raise AiUnavailableError("The model returned no structured output")
    return response.output_parsed


def generate_speech(text: str, instructions: str) -> bytes:
    response = _call(
        "speech",
        lambda client: client.audio.speech.create(
            model=settings.openai_tts_model,
            voice=settings.openai_tts_voice,
            input=text,
            instructions=instructions,
            response_format="mp3",
        ),
    )
    return response.content


def moderate(text: str) -> bool:
    """True if OpenAI's moderation flags `text`. Free, so it doesn't count toward the cap."""
    response = _call(
        "moderation",
        lambda client: client.moderations.create(model=MODERATION_MODEL, input=text),
        counted=False,
    )
    return bool(response.results[0].flagged)


@dataclass(frozen=True)
class KeyCheck:
    key: str  # masked: "sk-…abcd"
    status: Literal["ok", "invalid", "no_credit", "error"]
    missing_models: tuple[str, ...] = ()
    detail: str = ""


def check_keys(*, live: bool = False) -> list[KeyCheck]:
    """Check every configured key, in any AI_MODE. Listing models is free; `live` adds one
    16-token text call per key (a fraction of a cent) to detect exhausted credit."""
    wanted = (
        settings.openai_text_model,
        settings.openai_tts_model,
        settings.openai_image_model,
        MODERATION_MODEL,
    )
    checks = []
    for key in settings.openai_api_keys:
        secret = key.get_secret_value()
        client = _client(secret)
        try:
            available = {model.id for model in client.models.list()}
        except openai.AuthenticationError:
            checks.append(KeyCheck(key=_mask(secret), status="invalid"))
            continue
        except openai.OpenAIError as error:
            checks.append(KeyCheck(key=_mask(secret), status="error", detail=_name(error)))
            continue
        missing = tuple(model for model in wanted if model not in available)
        status: Literal["ok", "no_credit", "error"] = "ok"
        detail = ""
        if live:
            try:
                client.responses.create(**_text_params("Reply with OK.", "ping", 16))
            except openai.RateLimitError as error:
                status = "no_credit" if _is_billing_error(error) else "error"
                detail = "" if status == "no_credit" else _name(error)
            except openai.OpenAIError as error:
                status, detail = "error", _name(error)
        checks.append(
            KeyCheck(key=_mask(secret), status=status, missing_models=missing, detail=detail)
        )
    return checks


def _call[ResultT](
    purpose: str, request: Callable[[openai.OpenAI], ResultT], *, counted: bool = True
) -> ResultT:
    current_mode = mode()
    if current_mode != "live":
        raise AiUnavailableError(f"AI mode is {current_mode}")
    if counted:
        _count_call()
    redis_client = db.get_redis()
    for index, key in enumerate(settings.openai_api_keys):
        if redis_client.exists(db.dead_key_flag(index)):
            continue
        started = time.monotonic()
        try:
            result = request(_client(key.get_secret_value()))
        except openai.AuthenticationError:
            _retire(index, "invalid key")
            continue
        except openai.RateLimitError as error:
            if _is_billing_error(error):
                _retire(index, "out of credit")
                continue
            raise AiUnavailableError("OpenAI rate limit") from error
        except openai.OpenAIError as error:
            raise AiUnavailableError(f"OpenAI call failed: {_name(error)}") from error
        _log_usage(purpose, index, result, time.monotonic() - started)
        return result
    raise AiUnavailableError("No usable OpenAI key")


@lru_cache
def _client(api_key: str) -> openai.OpenAI:
    # One retry with backoff on the same key (rate limits, timeouts); never a different key.
    return openai.OpenAI(api_key=api_key, timeout=settings.openai_timeout_seconds, max_retries=1)


def _text_params(instructions: str, prompt: str, max_output_tokens: int) -> dict:
    params: dict = {
        "model": settings.openai_text_model,
        "instructions": instructions,
        "input": prompt,
        "max_output_tokens": max_output_tokens,
    }
    if settings.openai_reasoning_effort:
        params["reasoning"] = {"effort": settings.openai_reasoning_effort}
    return params


def _count_call() -> None:
    counter = db.ai_calls_key(datetime.now(UTC).strftime("%Y-%m-%d"))
    redis_client = db.get_redis()
    count = redis_client.incr(counter)
    if count == 1:
        redis_client.expire(counter, CALL_COUNTER_SECONDS)
    if count > settings.ai_daily_call_limit:
        raise AiUnavailableError("Daily AI call limit reached")


def _retire(index: int, reason: str) -> None:
    log.warning("OpenAI key #%d retired for %ds: %s", index + 1, DEAD_KEY_SECONDS, reason)
    db.get_redis().set(db.dead_key_flag(index), reason, ex=DEAD_KEY_SECONDS)


def _is_billing_error(error: openai.APIStatusError) -> bool:
    return error.code in BILLING_ERROR_CODES or error.type == "insufficient_quota"


def _log_usage(purpose: str, index: int, result: object, seconds: float) -> None:
    usage = getattr(result, "usage", None)
    log.info(
        "openai %s via key #%d in %.1fs (tokens in=%s out=%s)",
        purpose,
        index + 1,
        seconds,
        getattr(usage, "input_tokens", "-"),
        getattr(usage, "output_tokens", "-"),
    )


def _mask(secret: str) -> str:
    return f"{secret[:3]}…{secret[-4:]}" if len(secret) > 8 else "…"


def _name(error: Exception) -> str:
    return type(error).__name__
