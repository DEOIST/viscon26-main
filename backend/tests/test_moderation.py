import openai
import pytest
from fastapi.testclient import TestClient

from tests.conftest import CHARACTER
from tests.fake_openai import REQUEST, FakeOpenAI, moderation_response, use_live_clients


def test_live_mode_rejects_a_flagged_name(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    use_live_clients(monkeypatch, FakeOpenAI(moderation=(moderation_response(True),)))

    res = client.post("/api/runs", json={"character": CHARACTER})

    assert res.status_code == 422
    assert res.json() == {"detail": "Please choose another name"}


def test_live_mode_accepts_an_unflagged_name(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    fake = FakeOpenAI(moderation=(moderation_response(False),))
    use_live_clients(monkeypatch, fake)

    res = client.post("/api/runs", json={"character": CHARACTER})

    assert res.status_code == 201
    assert fake.moderations.create.calls[0]["input"] == "Alex"


def test_a_moderation_outage_does_not_block_enrolling(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    use_live_clients(monkeypatch, FakeOpenAI(moderation=(openai.APITimeoutError(request=REQUEST),)))

    assert client.post("/api/runs", json={"character": CHARACTER}).status_code == 201
