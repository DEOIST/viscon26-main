"""Shared fixtures. Every test runs with an in-process fakeredis, AI_MODE=off and no OpenAI keys,
and pytest-socket blocks the network (see pyproject.toml), so no test can spend API credits."""

from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient

from app import db
from app.config import settings
from app.main import app

CHARACTER = {
    "name": "Alex",
    "pronouns": "they",
    "department": "infk",
    "archetype": "nerd",
    "avatar": "a3",
}


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "redis_url", "")
    monkeypatch.setattr(settings, "ai_mode", "off")
    monkeypatch.setattr(settings, "openai_api_keys", [])
    db.get_redis.cache_clear()  # a fresh, empty fakeredis per test
    yield
    db.get_redis.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def make_run(client: TestClient) -> Callable[..., dict]:
    """Enroll a character (CHARACTER plus overrides) and return the created run JSON."""

    def make(**overrides: str) -> dict:
        res = client.post("/api/runs", json={"character": {**CHARACTER, **overrides}})
        assert res.status_code == 201, res.text
        return res.json()

    return make


@pytest.fixture
def graduated_run(client: TestClient, make_run: Callable[..., dict]) -> Callable[..., dict]:
    """Enroll, submit both minigame scores, graduate, and return the graduated run JSON."""

    def graduate(blackjack: int, shooter: int, **overrides: str) -> dict:
        run = make_run(**overrides)
        for game, score in (("blackjack", blackjack), ("shooter", shooter)):
            res = client.post(f"/api/runs/{run['id']}/scores", json={"game": game, "score": score})
            assert res.status_code == 200, res.text
        res = client.post(f"/api/runs/{run['id']}/graduate")
        assert res.status_code == 200, res.text
        return res.json()

    return graduate
