"""Attempt history and the activity graph; same throwaway database as the account tests."""

# The account tests' database fixtures are imported, then requested by name as parameters.
# ruff: noqa: F811

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.database import Attempt, get_db
from app.main import app
from app.services import attempts as attempts_service
from app.services.attempts import streaks
from tests.test_accounts import (  # noqa: F401
    client,
    connected_games,
    placeholder_games,
    profile,
    register,
)


def play(client, headers, game="year-1-slot", score=50):
    return client.post("/api/attempts", headers=headers, json={"gameId": game, "score": score})


def backdate(client, *moments, game="year-1-slot", score=40):
    """Store attempts at given UTC moments, as if they were played back then."""
    user_id = client.get("/api/session").json()["user"]["id"]
    with next(app.dependency_overrides[get_db]()) as db:
        for moment in moments:
            db.add(Attempt(user_id=user_id, game_id=game, score=score, finished_at=moment))
        db.commit()


def test_every_round_is_recorded_including_replays(client):
    headers = register(client)
    for score in (35, 80, 61):
        response = play(client, headers, score=score)
        assert response.status_code == 201, response.text
    saved = response.json()
    assert saved["gameId"] == "year-1-slot" and saved["score"] == 61
    assert datetime.fromisoformat(saved["finishedAt"]).tzinfo is not None
    history = client.get("/api/attempts").json()
    assert [row["score"] for row in history] == [61, 80, 35]  # newest first
    assert len(client.get("/api/attempts?limit=2").json()) == 2
    assert client.get("/api/attempts?limit=0").status_code == 422
    assert client.get("/api/attempts?limit=101").status_code == 422


def test_history_needs_an_account_and_a_csrf_token(client):
    client.get("/api/session")
    assert client.get("/api/attempts").status_code == 401
    assert client.get("/api/activity").status_code == 401
    headers = register(client)
    assert play(client, {}).status_code == 403
    assert play(client, headers).status_code == 201
    client.post("/api/logout", headers=headers)
    assert client.get("/api/attempts").status_code == 401


def test_players_only_see_their_own_history(client):
    first = register(client)
    play(client, first, score=99)
    client.post("/api/logout", headers=first)
    register(client, "second_private")
    assert client.get("/api/attempts").json() == []
    assert client.get("/api/activity").json()["totalAttempts"] == 0


def test_rejects_bad_scores_and_games(client, connected_games):
    headers = register(client)
    for bad in (-1, 101, "50", 50.5, None):
        assert play(client, headers, score=bad).status_code == 422
    extra = {"gameId": "year-1-slot", "score": 50, "ects": 999}
    assert client.post("/api/attempts", headers=headers, json=extra).status_code == 422
    assert play(client, headers, game="invented").status_code == 404
    # Year 2 stays locked until every Year 1 game is completed, as for completions.
    profile(client, headers)
    assert play(client, headers, game="year-2-slot").status_code == 409
    assert client.post("/api/completions/year-1-slot", headers=headers).status_code == 200
    assert play(client, headers, game="year-2-slot").status_code == 201


def test_placeholders_are_not_recorded(client, placeholder_games):
    headers = register(client)
    assert play(client, headers).status_code == 409
    assert client.get("/api/attempts").json() == []


def test_daily_limit(client, monkeypatch):
    monkeypatch.setattr(attempts_service, "DAILY_LIMIT", 2)
    headers = register(client)
    assert play(client, headers).status_code == 201
    assert play(client, headers).status_code == 201
    response = play(client, headers)
    assert response.status_code == 429 and "tomorrow" in response.json()["detail"]
    # Yesterday's rounds don't count against today.
    with next(app.dependency_overrides[get_db]()) as db:
        for row in db.query(Attempt):
            row.finished_at = datetime.now(UTC) - timedelta(days=2)
        db.commit()
    assert play(client, headers).status_code == 201


def test_activity_graph_counts_days_streaks_and_best_scores(client):
    headers = register(client)
    now = datetime.now(UTC)
    backdate(client, *(now - timedelta(days=n) for n in (1, 3, 4, 5, 400)))
    backdate(client, now - timedelta(days=3), score=88)
    for score in (20, 70):
        play(client, headers, score=score)
    activity = client.get("/api/activity").json()
    today = date.fromisoformat(activity["today"])
    assert today == now.date()
    counts = {date.fromisoformat(day["day"]): day["attempts"] for day in activity["days"]}
    assert counts == {
        today: 2,
        today - timedelta(days=1): 1,
        today - timedelta(days=3): 2,
        today - timedelta(days=4): 1,
        today - timedelta(days=5): 1,
    }  # the day 400 days ago is outside the graph but still counts below
    assert list(counts) == sorted(counts)
    assert activity["totalAttempts"] == 8
    assert activity["activeDays"] == 6
    assert (activity["currentStreak"], activity["longestStreak"]) == (2, 3)
    assert activity["bestScores"] == {"year-1-slot": 88}


def test_activity_days_follow_the_players_time_zone(client):
    register(client)
    zurich = ZoneInfo("Europe/Zurich")
    # Late evening UTC is already the next day in Zurich (UTC+1 or +2).
    moment = (datetime.now(UTC) - timedelta(days=2)).replace(hour=23, minute=30)
    backdate(client, moment)
    utc_day = client.get("/api/activity").json()["days"][0]["day"]
    local = client.get("/api/activity", params={"tz": "Europe/Zurich"}).json()
    assert utc_day == moment.date().isoformat()
    assert local["days"][0]["day"] == moment.astimezone(zurich).date().isoformat() != utc_day
    assert local["today"] == datetime.now(zurich).date().isoformat()
    for bad in ("Mars/Olympus_Mons", "Europe", "", "../etc/passwd", "x" * 65):
        assert client.get("/api/activity", params={"tz": bad}).status_code == 422


def test_streaks():
    today = date(2026, 10, 10)
    days = {today - timedelta(days=n) for n in (0, 1, 2, 5, 6, 7, 8, 20)}
    assert streaks(days, today) == (3, 4)
    # Not played yet today: yesterday's streak is still alive.
    assert streaks(days - {today}, today) == (2, 4)
    # A full day without a round ends it.
    assert streaks({today - timedelta(days=2)}, today) == (0, 1)
    assert streaks(set(), today) == (0, 0)
