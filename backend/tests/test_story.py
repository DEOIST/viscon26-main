from collections.abc import Callable
from datetime import UTC, datetime

import openai
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.prompts import DEPARTMENT_NAMES, MAX_QUESTION_LENGTH, DialogueEntry, DialogueOutput
from app.schemas import Character, Run
from app.services import fallbacks
from app.services import story as story_service
from tests.fake_openai import (
    REQUEST,
    FakeOpenAI,
    forbid_clients,
    parsed_response,
    speech_response,
    text_response,
    use_live_clients,
)

BLACKJACK_EVENTS = {
    "intro",
    "deal",
    "playerBlackjack",
    "playerBust",
    "dealerBust",
    "win",
    "lose",
    "push",
    "broke",
    "cashOut",
}
SHOOTER_EVENTS = {"intro", "streak", "miss", "halfway", "boss", "end", "questions"}


def _dialogue(client: TestClient, run_id: str, scene: str):
    return client.post(f"/api/runs/{run_id}/dialogue", json={"scene": scene})


@pytest.mark.parametrize(
    ("scene", "events"),
    [("campus", {"advisor"}), ("blackjack", BLACKJACK_EVENTS), ("shooter", SHOOTER_EVENTS)],
)
def test_with_ai_off_every_scene_gets_a_complete_fallback_pack(
    client: TestClient, make_run: Callable[..., dict], scene: str, events: set[str]
):
    run = make_run()

    res = _dialogue(client, run["id"], scene)

    assert res.status_code == 200
    pack = res.json()
    assert pack["scene"] == scene
    assert pack["source"] == "fallback"
    assert set(pack["lines"]) == events
    assert all(lines and all(line.strip() for line in lines) for lines in pack["lines"].values())


def test_the_fallback_advisor_talks_to_the_player_by_name(
    client: TestClient, make_run: Callable[..., dict]
):
    run = make_run(name="Zoë")

    advisor = _dialogue(client, run["id"], "campus").json()["lines"]["advisor"]

    assert any("Zoë" in line for line in advisor)


def test_dialogue_for_an_unknown_run_is_404(client: TestClient):
    assert _dialogue(client, "0123456789abcdef0123456789abcdef", "campus").status_code == 404


def test_an_unknown_scene_is_rejected(client: TestClient, make_run: Callable[..., dict]):
    assert _dialogue(client, make_run()["id"], "library").status_code == 422


def _ai_pack(*events: str) -> DialogueOutput:
    return DialogueOutput(
        entries=[DialogueEntry(event=event, lines=[f"AI line for {event}"]) for event in events]
    )


def test_ai_dialogue_is_generated_once_per_scene_and_progress_stage(
    client: TestClient, make_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    run = make_run()
    fake = FakeOpenAI(parse=(parsed_response(_ai_pack(*sorted(BLACKJACK_EVENTS))),))
    use_live_clients(monkeypatch, fake)

    first = _dialogue(client, run["id"], "blackjack").json()
    second = _dialogue(client, run["id"], "blackjack").json()

    assert first["source"] == "ai"
    assert first["lines"]["win"] == ["AI line for win"]
    assert second == first
    assert len(fake.responses.parse.calls) == 1

    client.post(f"/api/runs/{run['id']}/scores", json={"game": "shooter", "score": 70})
    _dialogue(client, run["id"], "blackjack")

    assert len(fake.responses.parse.calls) == 2


def test_events_the_ai_skipped_are_filled_from_the_fallback(
    client: TestClient, make_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    run = make_run()
    use_live_clients(monkeypatch, FakeOpenAI(parse=(parsed_response(_ai_pack("win")),)))

    pack = _dialogue(client, run["id"], "blackjack").json()

    assert pack["source"] == "ai"
    assert set(pack["lines"]) == BLACKJACK_EVENTS
    assert pack["lines"]["win"] == ["AI line for win"]
    assert pack["lines"]["lose"] and "AI line" not in pack["lines"]["lose"][0]


def test_the_prompt_carries_the_character_as_data(
    client: TestClient, make_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    run = make_run(name="Zoë", department="mavt")
    fake = FakeOpenAI(parse=(parsed_response(_ai_pack("advisor")),))
    use_live_clients(monkeypatch, fake)

    _dialogue(client, run["id"], "campus")

    prompt = fake.responses.parse.calls[0]["input"]
    assert '"name": "Zoë"' in prompt
    assert "Mechanical and Process Engineering" in prompt


def test_an_openai_outage_falls_back_without_hammering_openai(
    client: TestClient, make_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    run = make_run()
    fake = FakeOpenAI(parse=(openai.APITimeoutError(request=REQUEST),))
    use_live_clients(monkeypatch, fake)

    first = _dialogue(client, run["id"], "shooter").json()
    _dialogue(client, run["id"], "shooter")

    assert first["source"] == "fallback"
    assert len(fake.responses.parse.calls) == 1


def test_fake_mode_serves_ai_labelled_lines_without_any_openai_client(
    client: TestClient, make_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "ai_mode", "fake")
    monkeypatch.setattr(story_service, "FAKE_DELAY_SECONDS", 0)
    forbid_clients(monkeypatch)
    run = make_run()

    pack = _dialogue(client, run["id"], "shooter").json()

    assert pack["source"] == "ai"
    assert set(pack["lines"]) == SHOOTER_EVENTS


def test_the_epilogue_needs_a_graduated_run(client: TestClient, make_run: Callable[..., dict]):
    res = client.post(f"/api/runs/{make_run()['id']}/epilogue")

    assert res.status_code == 409


def test_the_epilogue_for_an_unknown_run_is_404(client: TestClient):
    assert client.post("/api/runs/0123456789abcdef0123456789abcdef/epilogue").status_code == 404


def test_the_fallback_epilogue_is_about_this_player_and_career(
    client: TestClient, graduated_run: Callable[..., dict]
):
    run = graduated_run(blackjack=45, shooter=45, name="Zoë")  # phd

    res = client.post(f"/api/runs/{run['id']}/epilogue")

    assert res.status_code == 200
    epilogue = res.json()
    assert epilogue["source"] == "fallback"
    assert "Zoë" in epilogue["text"]
    assert "PhD" in epilogue["text"]


def test_the_ai_epilogue_is_written_once_from_scores_and_career(
    client: TestClient, graduated_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    run = graduated_run(blackjack=45, shooter=45, name="Zoë")
    fake = FakeOpenAI(text=(text_response("  Zoë became a legend.  "),))
    use_live_clients(monkeypatch, fake)

    first = client.post(f"/api/runs/{run['id']}/epilogue").json()
    second = client.post(f"/api/runs/{run['id']}/epilogue").json()

    assert first == {"text": "Zoë became a legend.", "source": "ai"}
    assert second == first
    assert len(fake.responses.create.calls) == 1
    prompt = fake.responses.create.calls[0]["input"]
    assert "Eternal PhD student" in prompt
    assert '"totalScore": 45' in prompt


def test_narration_needs_the_epilogue_first(client: TestClient, graduated_run: Callable[..., dict]):
    run = graduated_run(blackjack=45, shooter=45)

    assert client.post(f"/api/runs/{run['id']}/epilogue/speech").status_code == 409


def test_narration_is_unavailable_when_ai_is_off(
    client: TestClient, graduated_run: Callable[..., dict]
):
    run = graduated_run(blackjack=45, shooter=45)
    client.post(f"/api/runs/{run['id']}/epilogue")

    res = client.post(f"/api/runs/{run['id']}/epilogue/speech")

    assert res.status_code == 503


def test_live_narration_reads_the_epilogue_once_and_returns_mp3(
    client: TestClient, graduated_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    run = graduated_run(blackjack=45, shooter=45)
    fake = FakeOpenAI(
        text=(text_response("Zoë became a legend."),),
        speech=(speech_response(b"ID3-fake-mp3"),),
    )
    use_live_clients(monkeypatch, fake)
    client.post(f"/api/runs/{run['id']}/epilogue")

    first = client.post(f"/api/runs/{run['id']}/epilogue/speech")
    second = client.post(f"/api/runs/{run['id']}/epilogue/speech")

    assert first.status_code == 200
    assert first.headers["content-type"] == "audio/mpeg"
    assert first.content == b"ID3-fake-mp3"
    assert second.content == b"ID3-fake-mp3"
    assert [call["input"] for call in fake.audio.speech.create.calls] == ["Zoë became a legend."]


def test_fake_mode_narration_is_a_short_wav_tone(
    client: TestClient, graduated_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    run = graduated_run(blackjack=45, shooter=45)
    monkeypatch.setattr(settings, "ai_mode", "fake")
    monkeypatch.setattr(story_service, "FAKE_DELAY_SECONDS", 0)
    forbid_clients(monkeypatch)
    client.post(f"/api/runs/{run['id']}/epilogue")

    res = client.post(f"/api/runs/{run['id']}/epilogue/speech")

    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert res.content.startswith(b"RIFF")


def test_narration_for_an_unknown_run_is_404(client: TestClient):
    res = client.post("/api/runs/0123456789abcdef0123456789abcdef/epilogue/speech")

    assert res.status_code == 404


def test_the_shooter_pack_has_exam_questions_short_enough_for_a_target(
    client: TestClient, make_run: Callable[..., dict]
):
    run = make_run(department="math")

    questions = _dialogue(client, run["id"], "shooter").json()["lines"]["questions"]

    assert len(questions) >= 8
    assert all(0 < len(question) <= 40 for question in questions)


@pytest.mark.parametrize("department", sorted(DEPARTMENT_NAMES))
def test_fallback_exam_questions_fit_a_target_in_every_department(department: str):
    run = Run(
        id="r1",
        created_at=datetime.now(UTC),
        character=Character(
            name="Ada", pronouns="they", department=department, archetype="nerd", avatar="a1"
        ),
    )

    questions = fallbacks.dialogue_lines(run, "shooter")["questions"]

    assert all(0 < len(question) <= MAX_QUESTION_LENGTH for question in questions)


def test_ai_exam_questions_longer_than_a_target_are_dropped(
    client: TestClient, make_run: Callable[..., dict], monkeypatch: pytest.MonkeyPatch
):
    run = make_run()
    too_long = "Prove that every bounded sequence of real numbers has a convergent subsequence"
    output = DialogueOutput(
        entries=[DialogueEntry(event="questions", lines=["Is P = NP?", too_long])]
    )
    use_live_clients(monkeypatch, FakeOpenAI(parse=(parsed_response(output),)))

    questions = _dialogue(client, run["id"], "shooter").json()["lines"]["questions"]

    assert questions == ["Is P = NP?"]
