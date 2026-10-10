from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient


def test_an_empty_hall_of_fame_is_an_empty_list(client: TestClient):
    res = client.get("/api/leaderboard")

    assert res.status_code == 200
    assert res.json() == []


def test_hall_of_fame_ranks_by_total_and_respects_the_limit(
    client: TestClient, graduated_run: Callable[..., dict]
):
    graduated_run(blackjack=50, shooter=50, name="Mid")
    top = graduated_run(blackjack=90, shooter=90, name="Top", department="math", avatar="a7")
    graduated_run(blackjack=70, shooter=70, name="Second")

    res = client.get("/api/leaderboard?limit=2")

    assert res.status_code == 200
    entries = res.json()
    assert [entry["name"] for entry in entries] == ["Top", "Second"]
    assert entries[0] == {
        "runId": top["id"],
        "name": "Top",
        "avatar": "a7",
        "department": "math",
        "totalScore": 90,
        "endingId": "quant",
        "graduatedAt": top["graduatedAt"],
    }


def test_runs_that_have_not_graduated_are_not_ranked(
    client: TestClient, make_run: Callable[..., dict]
):
    run = make_run()
    client.post(f"/api/runs/{run['id']}/scores", json={"game": "blackjack", "score": 100})

    assert client.get("/api/leaderboard").json() == []


@pytest.mark.parametrize("limit", [0, 51])
def test_the_limit_must_stay_between_1_and_50(client: TestClient, limit: int):
    assert client.get(f"/api/leaderboard?limit={limit}").status_code == 422


def test_ending_stats_list_every_ending_with_zero_defaults(
    client: TestClient, graduated_run: Callable[..., dict]
):
    graduated_run(blackjack=45, shooter=45)  # masters

    res = client.get("/api/leaderboard/endings")

    assert res.status_code == 200
    assert res.json() == {
        "total": 1,
        "counts": {"quant": 0, "phd": 0, "masters": 1, "mcdonalds": 0, "homeless": 0},
    }
