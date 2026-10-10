"""The dealer's dialogue: complete, short, about Galton Blackjack, and served by the story API."""

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.prompts import dialogue_instructions
from app.text import TEXT
from level2.dialogue import EVENTS, FALLBACK_LINES, SPEAKER

MAX_WORDS = 18  # the limit the AI's lines get (app/prompts.py); the fallbacks keep to it too


def test_every_event_has_alternative_fallback_lines():
    assert set(FALLBACK_LINES) == set(EVENTS)
    assert all(len(lines) >= 2 for lines in FALLBACK_LINES.values())


def test_fallback_lines_are_short_and_never_about_card_totals():
    for lines in FALLBACK_LINES.values():
        for line in lines:
            assert len(line.split()) <= MAX_WORDS, line
            assert "21" not in line and "twenty-one" not in line.lower(), line
            line.format(name="Ada", department="Physics")  # no other placeholder (KeyError)


def test_the_ai_is_told_the_rules_of_this_variant():
    assert SPEAKER in dialogue_instructions("blackjack")
    assert "red ball" in SPEAKER and "never mention 21" in SPEAKER


def test_with_ai_off_the_story_api_serves_the_dealers_lines_for_this_player(
    client: TestClient, make_run: Callable[..., dict]
):
    run = make_run(name="Zoë", department="phys")

    res = client.post(f"/api/runs/{run['id']}/dialogue", json={"scene": "blackjack"})

    assert res.status_code == 200
    pack = res.json()
    assert pack["source"] == "fallback"
    assert set(pack["lines"]) == set(EVENTS)
    lines = TEXT["story"]["blackjack"]
    assert pack["lines"]["intro"][0] == lines["intro"][0].replace("{name}", "Zoë")
    assert pack["lines"]["win"][0] == lines["win"][0].replace("{department}", "Physics")
    assert not any("{" in line for event in pack["lines"].values() for line in event)
