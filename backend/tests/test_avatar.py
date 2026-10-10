"""AI avatar creator: photo in, preset colors out; empty fallback whenever the AI is unavailable."""

import pytest
from fastapi.testclient import TestClient

from app import prompts
from app.config import settings
from app.game_config import CONFIG
from tests.fake_openai import (
    FakeOpenAI,
    forbid_clients,
    parsed_response,
    rate_limited,
    use_live_clients,
)

PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP8="
HAIR = {color["label"]: color["value"] for color in CONFIG["colors"]["hair"]}
EYES = {color["label"]: color["value"] for color in CONFIG["colors"]["eyes"]}


def suggest(client: TestClient, image: str = PHOTO, origin: str | None = None):
    headers = {"Origin": origin} if origin else {}
    return client.post("/api/avatar/suggestion", json={"image": image}, headers=headers)


def test_ai_off_returns_an_empty_fallback_without_calling_openai(client, monkeypatch):
    forbid_clients(monkeypatch)

    response = suggest(client)

    assert response.status_code == 200
    assert response.json() == {
        "hairColor": None,
        "hairLength": None,
        "eyeColor": None,
        "glasses": None,
        "gender": None,
        "source": "fallback",
    }


def test_live_answer_is_mapped_to_preset_hex_values(client, monkeypatch):
    traits = prompts.AvatarTraits(
        hair_color="Copper red",
        hair_length="long",
        eye_color="Forest green",
        glasses="sunglasses",
        gender="female",
    )
    openai_client = FakeOpenAI(parse=(parsed_response(traits),))
    use_live_clients(monkeypatch, openai_client)

    response = suggest(client)

    assert response.status_code == 200
    assert response.json() == {
        "hairColor": HAIR["Copper red"],
        "hairLength": "long",
        "eyeColor": EYES["Forest green"],
        "glasses": "sunglasses",
        "gender": "female",
        "source": "ai",
    }
    call = openai_client.responses.parse.calls[0]
    assert call["model"] == settings.openai_vision_model
    assert call["text_format"] is prompts.AvatarTraits
    image = call["input"][0]["content"][0]
    assert image == {"type": "input_image", "image_url": PHOTO, "detail": "low"}


def test_openai_failure_falls_back(client, monkeypatch):
    use_live_clients(monkeypatch, FakeOpenAI(parse=(rate_limited(),)))

    response = suggest(client)

    assert response.status_code == 200
    assert response.json()["source"] == "fallback"
    assert response.json()["hairColor"] is None


def test_fake_mode_returns_presets_without_a_call(client, monkeypatch):
    forbid_clients(monkeypatch)
    monkeypatch.setattr(settings, "ai_mode", "fake")

    body = suggest(client).json()

    assert body["source"] == "ai"
    assert body["hairColor"] in HAIR.values()
    assert body["eyeColor"] in EYES.values()


def test_rejects_a_disallowed_origin_without_needing_a_session(client, monkeypatch):
    forbid_clients(monkeypatch)

    assert suggest(client, origin="https://evil.example").status_code == 403
    assert suggest(client, origin="http://localhost:5173").status_code == 200


@pytest.mark.parametrize(
    "image",
    ["https://example.com/me.jpg", "data:text/html;base64,PGgxPg==", "data:image/jpeg;base64,"],
)
def test_only_image_data_urls_are_accepted(client, monkeypatch, image):
    forbid_clients(monkeypatch)

    assert suggest(client, image=image).status_code == 422
