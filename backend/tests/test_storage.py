import pytest
import redis
from fastapi.testclient import TestClient

from app import db


def _refuse(*_args: object, **_kwargs: object) -> None:
    raise redis.exceptions.ConnectionError("Connection refused")


def test_a_storage_outage_answers_503_with_a_readable_message(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(db.get_redis(), "get", _refuse)

    res = client.get("/api/runs/0123456789abcdef0123456789abcdef")

    assert res.status_code == 503
    assert res.json() == {"detail": "Storage is unavailable, try again in a moment"}


def test_health_stays_green_during_a_storage_outage(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    for command in ("get", "set", "ping"):
        monkeypatch.setattr(db.get_redis(), command, _refuse)

    assert client.get("/api/health").status_code == 200
