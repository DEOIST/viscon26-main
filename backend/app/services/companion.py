"""The dealer you can talk to at the blackjack table: short in-character answers, read aloud on
request.

Unlike the dialogue packs, every question is new, so answers are not cached; the per-player
hourly limit and ai.py's daily cap keep the credits safe. Questions are moderated (free) before
they reach the model, and only the dealer's own recent answers can be narrated, so the voice
can't be used to read arbitrary text.
"""

import base64
import hashlib
import json
import time
import uuid
from datetime import UTC, datetime

from app import ai, db, prompts
from app.schemas import CompanionReply
from app.services import fallbacks
from app.services.story import SpeechAudio, tone_wav

HISTORY_MESSAGES = 8  # the last 4 exchanges go back to the model as context
HISTORY_SECONDS = 3600
ASKS_PER_HOUR = 30  # questions plus narrations, per player
SPEECH_CACHE_SECONDS = 3600
FAKE_DELAY_SECONDS = 0.8


class CompanionLimitError(Exception):
    """The player has asked a lot this hour."""


class CompanionReplyNotFoundError(Exception):
    """Narration was asked for a reply that isn't among the player's recent AI answers."""


class CompanionVoiceUnavailableError(Exception):
    """No narration: the AI is off or failed."""


def ask_companion(player_id: str, name: str, question: str) -> CompanionReply:
    _count_ask(player_id)
    reply_id = uuid.uuid4().hex
    if ai.mode() == "fake":
        time.sleep(FAKE_DELAY_SECONDS)
        answer = fallbacks.companion_fake(question)
        _remember(player_id, question, answer, reply_id)
        return CompanionReply(id=reply_id, answer=answer, source="ai")
    try:
        if ai.moderate(question):
            return CompanionReply(
                id=reply_id, answer=fallbacks.companion_decline(name), source="fallback"
            )
        answer = ai.generate_text(
            prompts.COMPANION_INSTRUCTIONS,
            prompts.companion_prompt(name, _history(player_id), question),
            prompts.COMPANION_MAX_OUTPUT_TOKENS,
        ).strip()
    except ai.AiUnavailableError:
        answer = ""
    if not answer:
        return CompanionReply(
            id=reply_id, answer=fallbacks.companion_offline(name), source="fallback"
        )
    _remember(player_id, question, answer, reply_id)
    return CompanionReply(id=reply_id, answer=answer, source="ai")


def speak_companion(player_id: str, reply_id: str) -> SpeechAudio:
    text = next(
        (
            entry["text"]
            for entry in _stored(player_id)
            if entry.get("role") == "dealer" and entry.get("id") == reply_id
        ),
        None,
    )
    if text is None:
        raise CompanionReplyNotFoundError(reply_id)
    if ai.mode() == "fake":
        return SpeechAudio(tone_wav(), "audio/wav")
    key = db.companion_speech_key(hashlib.sha256(text.encode()).hexdigest())
    cached = db.get_redis().get(key)
    if cached:
        return SpeechAudio(base64.b64decode(cached), "audio/mpeg")
    _count_ask(player_id)
    try:
        audio = ai.generate_speech(text, prompts.COMPANION_VOICE_INSTRUCTIONS)
    except ai.AiUnavailableError as error:
        raise CompanionVoiceUnavailableError(str(error)) from error
    db.get_redis().set(key, base64.b64encode(audio).decode(), ex=SPEECH_CACHE_SECONDS)
    return SpeechAudio(audio, "audio/mpeg")


def _count_ask(player_id: str) -> None:
    key = db.companion_asks_key(player_id, datetime.now(UTC).strftime("%Y%m%d%H"))
    redis_client = db.get_redis()
    count = redis_client.incr(key)
    if count == 1:
        redis_client.expire(key, 3600)
    if count > ASKS_PER_HOUR:
        raise CompanionLimitError("The dealer needs a break. Ask again in a little while.")


def _stored(player_id: str) -> list[dict[str, str]]:
    raw = db.get_redis().lrange(db.companion_history_key(player_id), 0, -1)
    return [json.loads(entry) for entry in raw]


def _history(player_id: str) -> list[dict[str, str]]:
    """The conversation as the model sees it: who said what, without ids."""
    return [{"role": entry["role"], "text": entry["text"]} for entry in _stored(player_id)]


def _remember(player_id: str, question: str, answer: str, reply_id: str) -> None:
    """Only AI exchanges are kept: offline lines would only confuse the model's context."""
    key = db.companion_history_key(player_id)
    redis_client = db.get_redis()
    redis_client.rpush(
        key,
        json.dumps({"role": "player", "text": question}, ensure_ascii=False),
        json.dumps({"role": "dealer", "text": answer, "id": reply_id}, ensure_ascii=False),
    )
    redis_client.ltrim(key, -HISTORY_MESSAGES, -1)
    redis_client.expire(key, HISTORY_SECONDS)
