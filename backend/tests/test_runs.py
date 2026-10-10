import re
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from tests.conftest import CHARACTER


def test_enrolling_returns_a_fresh_run_with_the_character(client: TestClient):
    res = client.post("/api/runs", json={"character": CHARACTER})

    assert res.status_code == 201
    run = res.json()
    assert re.fullmatch(r"[0-9a-f]{32}", run["id"])
    assert run["character"] == CHARACTER
    assert run["scores"] == {}
    assert run["totalScore"] is None
    assert run["ending"] is None
    assert run["graduatedAt"] is None
    assert "createdAt" in run  # camelCase on the wire


def test_enrolling_trims_the_name(make_run: Callable[..., dict]):
    assert make_run(name="  Alex  ")["character"]["name"] == "Alex"


@pytest.mark.parametrize("name", ["Zoë Müller", "O'Brien-Smith", "Ana_2.0"])
def test_enrolling_accepts_accents_and_punctuation(make_run: Callable[..., dict], name: str):
    assert make_run(name=name)["character"]["name"] == name


@pytest.mark.parametrize("name", ["", "   ", "x" * 21, "<b>hi</b>", "a;b", "Alex 🎓"])
def test_enrolling_rejects_unsafe_names(client: TestClient, name: str):
    res = client.post("/api/runs", json={"character": {**CHARACTER, "name": name}})

    assert res.status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [("department", "cs"), ("pronouns", "it"), ("archetype", "wizard"), ("avatar", "A 1")],
)
def test_enrolling_rejects_unknown_character_options(client: TestClient, field: str, value: str):
    res = client.post("/api/runs", json={"character": {**CHARACTER, field: value}})

    assert res.status_code == 422


def test_a_run_can_be_read_back(client: TestClient, make_run: Callable[..., dict]):
    run = make_run()

    res = client.get(f"/api/runs/{run['id']}")

    assert res.status_code == 200
    assert res.json() == run


def test_reading_an_unknown_run_is_404(client: TestClient):
    assert client.get("/api/runs/0123456789abcdef0123456789abcdef").status_code == 404


def test_a_replayed_minigame_overwrites_its_score(
    client: TestClient, make_run: Callable[..., dict]
):
    run = make_run()

    client.post(f"/api/runs/{run['id']}/scores", json={"game": "blackjack", "score": 40})
    res = client.post(f"/api/runs/{run['id']}/scores", json={"game": "blackjack", "score": 60})

    assert res.status_code == 200
    assert res.json()["scores"] == {"blackjack": 60}
    assert client.get(f"/api/runs/{run['id']}").json()["scores"] == {"blackjack": 60}


@pytest.mark.parametrize("score", [-1, 101])
def test_scores_outside_0_to_100_are_rejected(
    client: TestClient, make_run: Callable[..., dict], score: int
):
    run = make_run()

    res = client.post(f"/api/runs/{run['id']}/scores", json={"game": "shooter", "score": score})

    assert res.status_code == 422


def test_scores_for_an_unknown_game_are_rejected(client: TestClient, make_run: Callable[..., dict]):
    run = make_run()

    res = client.post(f"/api/runs/{run['id']}/scores", json={"game": "chess", "score": 50})

    assert res.status_code == 422


def test_scoring_an_unknown_run_is_404(client: TestClient):
    res = client.post(
        "/api/runs/0123456789abcdef0123456789abcdef/scores",
        json={"game": "blackjack", "score": 50},
    )

    assert res.status_code == 404


def test_graduating_needs_both_scores(client: TestClient, make_run: Callable[..., dict]):
    run = make_run()
    client.post(f"/api/runs/{run['id']}/scores", json={"game": "blackjack", "score": 70})

    res = client.post(f"/api/runs/{run['id']}/graduate")

    assert res.status_code == 409


def test_graduating_fixes_total_and_ending(graduated_run: Callable[..., dict]):
    run = graduated_run(blackjack=90, shooter=81)  # mean 85.5 rounds half up to 86

    assert run["totalScore"] == 86
    assert run["ending"] == {"id": "quant", "title": "Quant researcher in Zug"}
    assert run["graduatedAt"] is not None


def test_graduating_twice_returns_the_same_run_and_counts_once(
    client: TestClient, graduated_run: Callable[..., dict]
):
    run = graduated_run(blackjack=50, shooter=50)

    again = client.post(f"/api/runs/{run['id']}/graduate")

    assert again.status_code == 200
    assert again.json() == run
    stats = client.get("/api/leaderboard/endings").json()
    assert stats["total"] == 1
    assert stats["counts"]["masters"] == 1


def test_scores_are_locked_after_graduation(client: TestClient, graduated_run: Callable[..., dict]):
    run = graduated_run(blackjack=50, shooter=50)

    res = client.post(f"/api/runs/{run['id']}/scores", json={"game": "shooter", "score": 100})

    assert res.status_code == 409
    assert client.get(f"/api/runs/{run['id']}").json()["scores"]["shooter"] == 50


def test_graduating_an_unknown_run_is_404(client: TestClient):
    assert client.post("/api/runs/0123456789abcdef0123456789abcdef/graduate").status_code == 404
