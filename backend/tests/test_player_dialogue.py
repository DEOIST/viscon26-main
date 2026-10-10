"""The blackjack dealer's dialogue for anonymous shell players. No test reaches OpenAI."""

# The player tests' database fixture is imported, then requested by name as a parameter.
# ruff: noqa: F811

import openai
import pytest

from tests.fake_openai import (
    REQUEST,
    FakeOpenAI,
    forbid_clients,
    parsed_response,
    use_live_clients,
)
from tests.test_players import client, player_path, profile  # noqa: F401
from tests.test_story import BLACKJACK_EVENTS, _ai_pack


def dialogue(client, path, scene="blackjack"):
    return client.post(f"{path}/dialogue", json={"scene": scene})


def test_with_ai_off_the_dealer_gets_fallback_lines_with_the_players_name(client, monkeypatch):
    forbid_clients(monkeypatch)
    path = player_path()
    profile(client, path, "Zoë")

    response = dialogue(client, path)

    assert response.status_code == 200
    pack = response.json()
    assert (pack["scene"], pack["source"]) == ("blackjack", "fallback")
    assert set(pack["lines"]) == BLACKJACK_EVENTS
    assert any("Zoë" in line for line in pack["lines"]["intro"])


def test_ai_lines_are_generated_once_per_player_and_cached(client, monkeypatch):
    fake = FakeOpenAI(
        parse=(
            parsed_response(_ai_pack(*sorted(BLACKJACK_EVENTS))),
            parsed_response(_ai_pack(*sorted(BLACKJACK_EVENTS))),
        )
    )
    use_live_clients(monkeypatch, fake)
    first_player, second_player = player_path(), player_path()
    profile(client, first_player, "Ada")
    profile(client, second_player, "Grace")

    first = dialogue(client, first_player).json()
    again = dialogue(client, first_player).json()

    assert first["source"] == "ai"
    assert first["lines"]["win"] == ["AI line for win"]
    assert again == first
    assert len(fake.responses.parse.calls) == 1
    prompt = fake.responses.parse.calls[0]["input"]
    assert '"name": "Ada"' in prompt
    # Another player gets their own pack.
    dialogue(client, second_player)
    assert len(fake.responses.parse.calls) == 2
    assert '"name": "Grace"' in fake.responses.parse.calls[1]["input"]


def test_an_openai_outage_falls_back_and_is_retried_later(client, monkeypatch):
    fake = FakeOpenAI(parse=(openai.APITimeoutError(request=REQUEST),))
    use_live_clients(monkeypatch, fake)
    path = player_path()
    profile(client, path)

    first = dialogue(client, path).json()
    dialogue(client, path)

    assert first["source"] == "fallback"
    assert set(first["lines"]) == BLACKJACK_EVENTS
    # The fallback is cached for a few minutes, so an outage isn't hammered.
    assert len(fake.responses.parse.calls) == 1


def test_free_text_shell_names_reach_the_prompt_as_data(client, monkeypatch):
    # Shell names allow more than the run API's CharacterName (here: "!" and 24 characters).
    fake = FakeOpenAI(parse=(parsed_response(_ai_pack("intro")),))
    use_live_clients(monkeypatch, fake)
    path = player_path()
    name = "Ada {name}! Lovelace 1815"[:24]
    profile(client, path, name)

    pack = dialogue(client, path).json()

    assert pack["source"] == "ai"
    assert '"name": "Ada {name}! Lovelace 181' in fake.responses.parse.calls[0]["input"]


def test_unknown_players_scenes_and_ids_are_rejected(client, monkeypatch):
    forbid_clients(monkeypatch)
    assert dialogue(client, player_path()).status_code == 404
    assert dialogue(client, "/api/players/not-a-uuid").status_code == 422
    path = player_path()
    profile(client, path)
    assert dialogue(client, path, scene="library").status_code == 422


@pytest.mark.parametrize("scene", ["campus", "shooter"])
def test_other_scenes_work_for_players_too(client, scene):
    path = player_path()
    profile(client, path)
    response = dialogue(client, path, scene)
    assert response.status_code == 200
    assert response.json()["scene"] == scene
