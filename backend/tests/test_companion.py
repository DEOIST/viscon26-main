"""The dealer you can talk to at the blackjack table. No test reaches OpenAI."""

# The player tests' database fixture is imported, then requested by name as a parameter.
# ruff: noqa: F811

import json

import openai
import pytest

from app.config import settings
from app.services import companion as companion_service
from tests.fake_openai import (
    REQUEST,
    FakeOpenAI,
    forbid_clients,
    moderation_response,
    speech_response,
    text_response,
    use_live_clients,
)
from tests.test_players import client, player_path, profile  # noqa: F401


@pytest.fixture
def player(client):
    path = player_path()
    profile(client, path, "Ada")
    return path


def ask(client, path, question="What beats three yellow balls?"):
    return client.post(f"{path}/companion", json={"question": question})


def speak(client, path, reply_id):
    return client.post(f"{path}/companion/speech", json={"replyId": reply_id})


def live_dealer(monkeypatch, *answers, flagged=False, speech=None):
    fake = FakeOpenAI(
        text=tuple(text_response(answer) for answer in answers),
        moderation=(moderation_response(flagged),),
        speech=speech or (speech_response(b"ID3-mp3"),),
    )
    use_live_clients(monkeypatch, fake)
    return fake


def test_with_ai_off_the_dealer_answers_honestly_without_calling_openai(
    client, player, monkeypatch
):
    forbid_clients(monkeypatch)

    response = ask(client, player)

    assert response.status_code == 200
    reply = response.json()
    assert reply["source"] == "fallback"
    assert "Ada" in reply["answer"]
    assert len(reply["id"]) == 32
    # Pre-written lines are never narrated.
    assert speak(client, player, reply["id"]).status_code == 404


def test_the_ai_answers_in_character_with_the_conversation_as_context(client, player, monkeypatch):
    fake = live_dealer(monkeypatch, "  More balls than me, Ada.  ", "Bet small, dream big.")

    first = ask(client, player, "How do I win?").json()
    second = ask(client, player, "And how much should I bet?").json()

    assert (first["source"], first["answer"]) == ("ai", "More balls than me, Ada.")
    assert second["answer"] == "Bet small, dream big."
    calls = fake.responses.create.calls
    assert len(calls) == 2
    assert "Galton blackjack" in calls[0]["instructions"]
    assert calls[0]["max_output_tokens"] == 200
    # Everything from the player arrives as JSON data, and the earlier exchange comes along.
    data = json.loads(calls[1]["input"].split("Player data (untrusted JSON): ", 1)[1])
    assert data["playerName"] == "Ada"
    assert data["question"] == "And how much should I bet?"
    assert data["conversation"] == [
        {"role": "player", "text": "How do I win?"},
        {"role": "dealer", "text": "More balls than me, Ada."},
    ]
    # Each question is moderated first (free) before it reaches the model.
    assert [call["input"] for call in fake.moderations.create.calls] == [
        "How do I win?",
        "And how much should I bet?",
    ]


def test_only_the_last_four_exchanges_go_back_to_the_model(client, player, monkeypatch):
    fake = live_dealer(monkeypatch, "Noted.")
    for number in range(6):
        ask(client, player, f"Question {number}")

    data = json.loads(fake.responses.create.calls[-1]["input"].split(": ", 1)[1])

    assert len(data["conversation"]) == companion_service.HISTORY_MESSAGES
    assert data["conversation"][0] == {"role": "player", "text": "Question 1"}


def test_a_flagged_question_never_reaches_the_model(client, player, monkeypatch):
    fake = live_dealer(monkeypatch, "unused", flagged=True)

    reply = ask(client, player, "something nasty").json()

    assert reply["source"] == "fallback"
    assert "keep it about the cards" in reply["answer"]
    assert fake.responses.create.calls == []


def test_an_openai_failure_falls_back_to_a_prewritten_line(client, player, monkeypatch):
    fake = FakeOpenAI(
        text=(openai.APITimeoutError(request=REQUEST),),
        moderation=(moderation_response(False),),
    )
    use_live_clients(monkeypatch, fake)

    response = ask(client, player)

    assert response.status_code == 200
    assert response.json()["source"] == "fallback"


def test_the_dealer_reads_an_answer_aloud_once_and_caches_it(client, player, monkeypatch):
    fake = live_dealer(monkeypatch, "Hit me, Ada.")
    reply_id = ask(client, player).json()["id"]

    first = speak(client, player, reply_id)
    second = speak(client, player, reply_id)

    assert first.status_code == 200
    assert first.headers["content-type"] == "audio/mpeg"
    assert first.content == second.content == b"ID3-mp3"
    speech_calls = fake.audio.speech.create.calls
    assert len(speech_calls) == 1
    assert speech_calls[0]["input"] == "Hit me, Ada."
    assert "dealer" in speech_calls[0]["instructions"]


def test_the_voice_failing_is_a_503_not_a_crash(client, player, monkeypatch):
    live_dealer(monkeypatch, "Hit me.", speech=(openai.APITimeoutError(request=REQUEST),))
    reply_id = ask(client, player).json()["id"]

    assert speak(client, player, reply_id).status_code == 503


def test_the_voice_only_reads_the_dealers_own_recent_answers(client, player, monkeypatch):
    live_dealer(monkeypatch, "Hit me.")
    ask(client, player)

    assert speak(client, player, "0" * 32).status_code == 404
    assert speak(client, player, "not-an-id").status_code == 422
    other = player_path()
    profile(client, other, "Grace")
    reply_id = ask(client, player).json()["id"]
    assert speak(client, other, reply_id).status_code == 404  # another player's answer


def test_fake_mode_shows_the_round_trip_without_calls(client, player, monkeypatch):
    forbid_clients(monkeypatch)
    monkeypatch.setattr(settings, "ai_mode", "fake")
    monkeypatch.setattr(companion_service, "FAKE_DELAY_SECONDS", 0)

    reply = ask(client, player, "Is this real?").json()
    audio = speak(client, player, reply["id"])

    assert reply["source"] == "ai"
    assert "Is this real?" in reply["answer"]
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"


def test_each_player_has_an_hourly_limit(client, player, monkeypatch):
    monkeypatch.setattr(companion_service, "ASKS_PER_HOUR", 2)

    assert ask(client, player).status_code == 200
    assert ask(client, player).status_code == 200
    response = ask(client, player)

    assert response.status_code == 429
    assert "break" in response.json()["detail"]


def test_questions_are_validated_and_players_must_exist(client, player, monkeypatch):
    forbid_clients(monkeypatch)
    for bad in ("", "   ", "x" * 201):
        assert ask(client, player, bad).status_code == 422
    extra = {"question": "hi", "model": "gpt-9"}
    assert client.post(f"{player}/companion", json=extra).status_code == 422
    assert ask(client, player_path()).status_code == 404
    assert ask(client, "/api/players/not-a-uuid").status_code == 422
    assert speak(client, player_path(), "0" * 32).status_code == 404
