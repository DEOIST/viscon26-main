"""Shell integration: persisted character data, completion safety and graduation lifecycle."""

import pytest

from app import db
from app.game_config import CONFIG, GAMES


@pytest.fixture
def connected_games(monkeypatch):
    for game in GAMES.values():
        monkeypatch.setitem(game, "implemented", True)


def enroll(client, name="Ada"):
    character = {
        "name": name,
        "pronouns": "they",
        "department": "infk",
        "archetype": "gamer",
        "avatar": "a3",
        "hairColor": CONFIG["colors"]["hair"][0]["value"],
        "skinColor": CONFIG["colors"]["skin"][0]["value"],
        "eyeColor": CONFIG["colors"]["eyes"][0]["value"],
    }
    response = client.post("/api/runs", json={"character": character})
    assert response.status_code == 201
    assert response.json()["character"] == character
    return response.json()


def test_character_and_progress_survive_page_reads(client):
    run = enroll(client, "Zoë")
    assert client.get(f"/api/runs/{run['id']}").json() == run
    assert run["ectsPoints"] == 0
    assert run["completedGameIds"] == []
    assert run["scores"] == {}


def test_previews_cannot_award_credits_or_graduate(client):
    run = enroll(client)
    previews = [game for game, config in GAMES.items() if not config["implemented"]]
    assert previews == ["blackjack"]  # the shooter is implemented (level 1)
    for game in previews:
        response = client.post(f"/api/runs/{run['id']}/scores", json={"game": game, "score": 100})
        assert response.status_code == 409
    assert client.post(f"/api/runs/{run['id']}/graduate").status_code == 409
    assert client.get(f"/api/runs/{run['id']}").json()["ectsPoints"] == 0
    assert client.get("/api/leaderboard").json() == []


def test_independent_games_replay_and_idempotent_graduation(client, connected_games):
    run = enroll(client)
    path = f"/api/runs/{run['id']}"
    # Either activity can be played first; repeated completion never duplicates credits.
    for score in (0, 85, 85):
        response = client.post(f"{path}/scores", json={"game": "shooter", "score": score})
        assert response.status_code == 200
        assert response.json()["ectsPoints"] == 90
        assert response.json()["completedGameIds"] == ["shooter"]
    assert client.post(f"{path}/graduate").status_code == 409
    response = client.post(f"{path}/scores", json={"game": "blackjack", "score": 85, "ects": 999})
    assert response.json()["ectsPoints"] == CONFIG["totalEcts"]
    assert response.json()["completedGameIds"] == ["blackjack", "shooter"]
    graduated = client.post(f"{path}/graduate").json()
    assert graduated["totalScore"] == 85
    assert graduated["ending"]["id"] == "c_level"
    assert client.post(f"{path}/graduate").json() == graduated
    assert client.post(f"{path}/scores", json={"game": "shooter", "score": 100}).status_code == 409
    assert client.get("/api/leaderboard/endings").json()["total"] == 1
    entry = client.get("/api/leaderboard").json()[0]
    assert entry["runId"] == run["id"]
    assert entry["totalScore"] == 85


@pytest.mark.parametrize("score", [-1, 101, 1.5, True, "90"])
def test_invalid_scores_are_rejected(client, connected_games, score):
    run = enroll(client)
    assert (
        client.post(
            f"/api/runs/{run['id']}/scores", json={"game": "shooter", "score": score}
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [("name", " "), ("name", "<script>"), ("avatar", "a99"), ("hairColor", "red")],
)
def test_character_validation(client, field, value):
    character = enroll(client)["character"]
    character[field] = value
    assert client.post("/api/runs", json={"character": character}).status_code == 422


def test_missing_runs_and_unknown_games(client):
    assert client.get("/api/runs/missing").status_code == 404
    assert (
        client.post("/api/runs/missing/scores", json={"game": "shooter", "score": 50}).status_code
        == 404
    )
    run = enroll(client)
    assert (
        client.post(
            f"/api/runs/{run['id']}/scores", json={"game": "invented", "score": 50}
        ).status_code
        == 422
    )
    assert client.get("/api/leaderboard?limit=1000").status_code == 422


def test_storage_failure_is_readable_and_health_stays_available(client, monkeypatch):
    from redis.exceptions import ConnectionError as RedisConnectionError

    def unavailable():
        raise RedisConnectionError("offline")

    monkeypatch.setattr(db, "get_redis", unavailable)
    assert client.get("/api/runs/missing").status_code == 503
    assert client.get("/api/health").status_code == 200
