import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import settings


def test_health_returns_ok(client):
    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json()["status"] == "ok"


@pytest.mark.parametrize("enabled", [False, True])
def test_public_config_exposes_only_the_preview_flag(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, enabled: bool
) -> None:
    monkeypatch.setattr(settings, "graduation_preview", enabled)
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "openai_api_keys", [SecretStr("private-ai-marker")])
    monkeypatch.setattr(settings, "postgres_password", SecretStr("private-db-marker"))

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json() == {"graduationPreview": enabled}
    assert response.headers["Cache-Control"] == "no-store"
