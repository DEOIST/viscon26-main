"""Story content from OpenAI: dialogue packs, the epilogue and its narration.

Every function answers even when the AI can't: AI_MODE=off, no keys, the daily cap or an OpenAI
failure all lead to the pre-written fallback (services/fallbacks.py). AI results are cached per
run for good, fallbacks only for a few minutes, so an outage isn't hammered and the AI gets
another chance once it is back. AI_MODE=fake serves canned content after a short delay.
"""

import base64
import io
import math
import struct
import time
import wave
from dataclasses import dataclass
from datetime import UTC, datetime

from app import ai, db, prompts
from app.schemas import Character, DialoguePack, DialogueScene, Epilogue, Run
from app.services import fallbacks
from app.services.runs import RunStateError, get_run_by_id

FALLBACK_CACHE_SECONDS = 300
SPEECH_CACHE_SECONDS = 24 * 3600
FAKE_DELAY_SECONDS = 1.2


class NarratorUnavailableError(Exception):
    """No narration: AI is off or failed. The frontend plays the pre-generated ending audio."""


@dataclass(frozen=True)
class SpeechAudio:
    content: bytes
    media_type: str


def generate_dialogue(run_id: str, scene: DialogueScene) -> DialoguePack | None:
    run = get_run_by_id(run_id)
    if run is None:
        return None
    key = db.dialogue_key(run_id, scene, len(run.scores))
    cached = db.get_redis().get(key)
    if cached:
        return DialoguePack.model_validate_json(cached)
    pack = _dialogue_pack(run, scene)
    db.get_redis().set(key, pack.model_dump_json(), ex=_cache_seconds(pack.source))
    return pack


def generate_player_dialogue(player_id: str, name: str, scene: DialogueScene) -> DialoguePack:
    """Dialogue for the anonymous shell, which has players instead of runs. One pack per player
    and scene: the prompt doesn't change with progress, so a second AI call would buy nothing."""
    key = db.dialogue_key(f"player:{player_id}", scene, 0)
    cached = db.get_redis().get(key)
    if cached:
        return DialoguePack.model_validate_json(cached)
    pack = _dialogue_pack(_shell_run(player_id, name), scene)
    db.get_redis().set(key, pack.model_dump_json(), ex=_cache_seconds(pack.source))
    return pack


def generate_epilogue(run_id: str) -> Epilogue | None:
    run = get_run_by_id(run_id)
    if run is None:
        return None
    if run.ending is None:
        raise RunStateError("Graduate before asking for the epilogue")
    cached = db.get_redis().get(db.epilogue_key(run_id))
    if cached:
        return Epilogue.model_validate_json(cached)
    epilogue = _epilogue(run)
    db.get_redis().set(
        db.epilogue_key(run_id), epilogue.model_dump_json(), ex=_cache_seconds(epilogue.source)
    )
    return epilogue


def generate_epilogue_speech(run_id: str) -> SpeechAudio | None:
    if get_run_by_id(run_id) is None:
        return None
    stored_epilogue = db.get_redis().get(db.epilogue_key(run_id))
    if stored_epilogue is None:
        raise RunStateError("Generate the epilogue before its narration")
    if ai.mode() == "fake":
        return SpeechAudio(_tone_wav(), "audio/wav")
    cached = db.get_redis().get(db.speech_key(run_id))
    if cached:
        return SpeechAudio(base64.b64decode(cached), "audio/mpeg")
    epilogue = Epilogue.model_validate_json(stored_epilogue)
    try:
        audio = ai.generate_speech(epilogue.text, prompts.NARRATOR_INSTRUCTIONS)
    except ai.AiUnavailableError as error:
        raise NarratorUnavailableError(str(error)) from error
    # Base64 keeps binary audio in the same text-mode Redis client as everything else.
    db.get_redis().set(
        db.speech_key(run_id), base64.b64encode(audio).decode(), ex=SPEECH_CACHE_SECONDS
    )
    return SpeechAudio(audio, "audio/mpeg")


def _shell_run(player_id: str, name: str) -> Run:
    """The shell player as the run the prompt and the fallbacks expect: the same D-INFK,
    they/them character the shell hands its games (frontend/src/minigames/DestinationGame.tsx).
    Built without validation because shell names are free text, not CharacterName; the prompt
    only ever sends a name as JSON data and the fallbacks as a format argument."""
    character = Character.model_construct(
        name=name, pronouns="they", department="infk", archetype=None, avatar="a1"
    )
    return Run.model_construct(
        id=player_id, character=character, created_at=datetime.now(UTC), scores={}
    )


def _dialogue_pack(run: Run, scene: DialogueScene) -> DialoguePack:
    fallback = fallbacks.dialogue_lines(run, scene)
    if ai.mode() == "fake":
        time.sleep(FAKE_DELAY_SECONDS)
        return DialoguePack(scene=scene, lines=fallback, source="ai")
    try:
        output = ai.generate_structured(
            prompts.dialogue_instructions(scene),
            prompts.dialogue_prompt(run, scene),
            prompts.DialogueOutput,
            prompts.DIALOGUE_MAX_OUTPUT_TOKENS,
        )
    except ai.AiUnavailableError:
        return DialoguePack(scene=scene, lines=fallback, source="fallback")
    generated = {
        entry.event: [line.strip() for line in entry.lines if line.strip()]
        for entry in output.entries
    }
    # The game needs every event key: anything the model skipped comes from the fallback.
    lines = {
        event: generated.get(event) or fallback[event] for event in prompts.DIALOGUE_EVENTS[scene]
    }
    return DialoguePack(scene=scene, lines=lines, source="ai")


def _epilogue(run: Run) -> Epilogue:
    if ai.mode() == "fake":
        time.sleep(FAKE_DELAY_SECONDS)
        return Epilogue(text=fallbacks.epilogue_text(run), source="ai")
    try:
        text = ai.generate_text(
            prompts.EPILOGUE_INSTRUCTIONS,
            prompts.epilogue_prompt(run),
            prompts.EPILOGUE_MAX_OUTPUT_TOKENS,
        ).strip()
    except ai.AiUnavailableError:
        text = ""
    if not text:
        return Epilogue(text=fallbacks.epilogue_text(run), source="fallback")
    return Epilogue(text=text, source="ai")


def _cache_seconds(source: str) -> int | None:
    return None if source == "ai" else FALLBACK_CACHE_SECONDS


def _tone_wav(seconds: float = 0.6, frequency: float = 440.0, rate: int = 16_000) -> bytes:
    """A short beep standing in for narration in AI_MODE=fake."""
    samples = (
        int(8000 * math.sin(2 * math.pi * frequency * index / rate))
        for index in range(int(seconds * rate))
    )
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(rate)
        file.writeframes(b"".join(struct.pack("<h", sample) for sample in samples))
    return buffer.getvalue()
