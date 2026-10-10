"""Shared fixtures. Every test runs with an in-process fakeredis, AI_MODE=off and no OpenAI keys,
and pytest-socket blocks the network (see pyproject.toml), so no test can spend API credits."""

import socket
import sys
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient

from app import db
from app.config import settings
from app.game_config import GAMES
from app.main import app

CHARACTER = {
    "name": "Alex",
    "pronouns": "they",
    "department": "infk",
    "archetype": "nerd",
    "avatar": "a3",
    "hairColor": "#70432E",
    "skinColor": "#E4B48F",
    "eyeColor": "#4B3024",
}

if sys.platform == "win32":
    # Windows has no AF_UNIX socketpair: the event loop under TestClient builds its self-pipe from
    # a loopback TCP pair, which --disable-socket blocks. Let only socketpair() use real sockets.
    _real_socket = socket.socket  # captured before pytest-socket guards each test
    _real_socketpair = socket.socketpair

    def _loopback_socketpair(
        *args: object, **kwargs: object
    ) -> tuple[socket.socket, socket.socket]:
        guarded, socket.socket = socket.socket, _real_socket
        try:
            return _real_socketpair(*args, **kwargs)
        finally:
            socket.socket = guarded

    socket.socketpair = _loopback_socketpair


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "redis_url", "")
    monkeypatch.setattr(settings, "ai_mode", "off")
    monkeypatch.setattr(settings, "openai_api_keys", [])
    get_redis = db.get_redis
    get_redis.cache_clear()  # a fresh, empty fakeredis per test
    yield
    get_redis.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def connected_games(monkeypatch: pytest.MonkeyPatch) -> None:
    """Exercise completed game contracts without enabling public preview rewards."""
    for game in GAMES.values():
        monkeypatch.setitem(game, "implemented", True)


@pytest.fixture
def make_run(client: TestClient, connected_games: None) -> Callable[..., dict]:
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
