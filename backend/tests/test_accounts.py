"""Account shell regression checks; no application database records are touched."""

import os
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import database
from app.database import Profile, get_db
from app.main import app
from app.shell_config import CONFIG, GAMES, YEARS


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    postgres_url = os.getenv("TEST_DATABASE_URL")
    schema = "test_" + uuid.uuid4().hex
    if postgres_url:
        admin_engine = create_engine(postgres_url)
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        test_engine = create_engine(
            postgres_url, execution_options={"schema_translate_map": {None: schema}}
        )
    else:
        test_engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    sessions = sessionmaker(test_engine, expire_on_commit=False)

    def override_db():
        with sessions() as db:
            yield db

    monkeypatch.setattr(database, "engine", test_engine)
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        test_engine.dispose()
        if postgres_url:
            with admin_engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            admin_engine.dispose()


@pytest.fixture
def connected_games(monkeypatch):
    for game in GAMES.values():
        monkeypatch.setitem(game, "implemented", True)


def register(client, identifier="ada_private_login"):
    token = client.get("/api/session").json()["csrfToken"]
    response = client.post(
        "/api/register",
        headers={"X-CSRF-Token": token},
        json={"identifier": identifier, "password": "ten-or-more-letters"},
    )
    assert response.status_code == 201
    return {"X-CSRF-Token": response.json()["csrfToken"]}


def profile(client, headers, name="  Ada  "):
    response = client.put(
        "/api/profile",
        headers=headers,
        json={
            "name": name,
            "hairColor": CONFIG["colors"]["hair"][0]["value"],
            "skinColor": CONFIG["colors"]["skin"][0]["value"],
            "eyeColor": CONFIG["colors"]["eyes"][0]["value"],
            "major": CONFIG["major"],
            "onboardingStage": "main",
        },
    )
    assert response.status_code == 200
    assert response.json()["name"] == name.strip()


def test_rejects_out_of_order_completion(client, connected_games):
    headers = register(client)
    profile(client, headers)
    second = YEARS[1]["games"][0]["id"]
    assert client.post(f"/api/completions/{second}", headers=headers).status_code == 409
    assert client.get("/api/progress").json()["ects"] == 0


def test_idempotency_ects_and_graduation(client, connected_games):
    headers = register(client)
    profile(client, headers)
    assert client.post("/api/graduation", headers=headers).status_code == 409
    first = YEARS[0]["games"][0]["id"]
    for _ in range(2):
        response = client.post(f"/api/completions/{first}", headers=headers, json={"ects": 999})
        assert response.status_code == 200
        assert response.json()["ects"] == YEARS[0]["ects"]
        assert response.json()["completedGameIds"] == [first]
    for year in YEARS[1:]:
        for game in year["games"]:
            assert client.post(f"/api/completions/{game['id']}", headers=headers).status_code == 200
    for _ in range(2):
        response = client.post("/api/graduation", headers=headers)
        assert response.status_code == 200
        assert response.json()["graduated"] is True
        assert response.json()["ects"] == CONFIG["totalEcts"]
    assert len(client.get("/api/progress").json()["completedGameIds"]) == len(GAMES)


def test_placeholder_and_unknown_games_cannot_earn_credits(client):
    headers = register(client)
    profile(client, headers)
    assert client.post("/api/completions/year-1-slot", headers=headers).status_code == 409
    assert client.post("/api/completions/invented", headers=headers).status_code == 404
    assert client.get("/api/scoreboard").json()[0]["ects"] == 0


def test_csrf_rotation_logout_and_private_scoreboard(client):
    session = client.get("/api/session")
    old_cookie = client.cookies.get("eth_session")
    old_token = session.json()["csrfToken"]
    assert "httponly" in session.headers["set-cookie"].lower()
    credentials = {"identifier": "ada_private_login", "password": "ten-or-more-letters"}
    assert client.post("/api/register", json=credentials).status_code == 403
    assert (
        client.post(
            "/api/register",
            headers={"X-CSRF-Token": old_token, "Origin": "https://evil.example"},
            json=credentials,
        ).status_code
        == 403
    )
    headers = register(client)
    profile(client, headers)
    rows = client.get("/api/scoreboard").json()
    assert rows == [{"name": "Ada", "major": "Computer Science", "ects": 0, "graduated": False}]
    assert "password" not in client.get("/api/session").text
    assert "ada_private_login" not in client.get("/api/session").text
    response = client.post("/api/logout", headers=headers)
    assert response.json()["user"] is None
    assert client.get("/api/progress").status_code == 401
    client.cookies.set("eth_session", old_cookie, path="/api", domain="testserver.local")
    assert client.get("/api/progress").status_code == 401
    fresh = client.get("/api/session").json()["csrfToken"]
    logged_in = client.post("/api/login", headers={"X-CSRF-Token": fresh}, json=credentials)
    assert logged_in.status_code == 200
    assert logged_in.json()["profile"]["name"] == "Ada"


def test_profile_validation_and_extra_reward_input(client):
    headers = register(client)
    data = {
        "name": " ",
        "hairColor": "#000000",
        "skinColor": "#FFFFFF",
        "eyeColor": "#000000",
        "onboardingStage": "main",
    }
    assert client.put("/api/profile", headers=headers, json=data).status_code == 422
    assert (
        client.post("/api/completions/year-1-slot", headers=headers, json={"ects": 999}).status_code
        == 409
    )
    assert client.get("/api/profile").json() is None


def test_multi_game_year_requires_every_game(client, connected_games, monkeypatch):
    first = YEARS[0]["games"][0]
    extra = {
        "id": "additional-test-game",
        "title": "Test callback only",
        "ects": 30,
        "implemented": True,
    }
    monkeypatch.setitem(first, "ects", 30)
    monkeypatch.setitem(YEARS[0], "games", [first, extra])
    monkeypatch.setitem(GAMES, extra["id"], extra)
    headers = register(client)
    profile(client, headers)
    assert client.post(f"/api/completions/{first['id']}", headers=headers).json()["ects"] == 30
    assert client.post("/api/completions/year-2-slot", headers=headers).status_code == 409
    assert client.post(f"/api/completions/{extra['id']}", headers=headers).json()["ects"] == 60
    assert client.post("/api/completions/year-2-slot", headers=headers).status_code == 200


def test_scoreboard_orders_by_ects_then_account_id(client, connected_games):
    first = register(client)
    profile(client, first, "First student")
    client.post("/api/logout", headers=first)
    second = register(client, "second_private")
    profile(client, second, "Second student")
    assert [row["name"] for row in client.get("/api/scoreboard").json()] == [
        "First student",
        "Second student",
    ]
    client.post("/api/completions/year-1-slot", headers=second)
    assert [row["name"] for row in client.get("/api/scoreboard").json()] == [
        "Second student",
        "First student",
    ]


@pytest.mark.parametrize("major", ["Computer Science", "D-INFK", "infk"])
def test_department_aliases_save_without_resetting_progress(client, connected_games, major):
    headers = register(client)
    profile(client, headers)
    assert client.post("/api/completions/year-1-slot", headers=headers).status_code == 200
    data = client.get("/api/profile").json()
    response = client.put(
        "/api/profile",
        headers=headers,
        json={
            "name": data["name"],
            **data["character"],
            "major": major,
            "onboardingStage": "main",
        },
    )
    assert response.status_code == 200
    assert response.json()["major"] == "Computer Science"
    assert client.get("/api/progress").json()["ects"] == 60


def test_reading_a_legacy_profile_does_not_rewrite_its_major(client):
    headers = register(client)
    profile(client, headers)
    with next(app.dependency_overrides[get_db]()) as db:
        saved = db.get(Profile, client.get("/api/session").json()["user"]["id"])
        saved.major = "D-INFK"
        db.commit()
    assert client.get("/api/profile").json()["major"] == "D-INFK"
    assert client.get("/api/session").json()["profile"]["major"] == "D-INFK"


def test_database_health_reports_a_real_connection_failure(client, monkeypatch):
    from sqlalchemy.exc import OperationalError

    from app.services import accounts

    assert client.get("/api/db-health").status_code == 200

    def unavailable(_db):
        raise OperationalError("SELECT 1", {}, Exception("offline"))

    monkeypatch.setattr(accounts, "database_health", unavailable)
    assert client.get("/api/db-health").status_code == 503
    assert client.get("/api/health").status_code == 200


def test_gender_and_glasses_are_saved_with_defaults(client):
    headers = register(client)
    profile(client, headers)
    character = client.get("/api/profile").json()["character"]
    assert (character["gender"], character["glasses"]) == ("unspecified", "none")

    body = {
        "name": "Ada",
        "hairColor": CONFIG["colors"]["hair"][0]["value"],
        "skinColor": CONFIG["colors"]["skin"][0]["value"],
        "eyeColor": CONFIG["colors"]["eyes"][0]["value"],
        "onboardingStage": "main",
    }
    chosen = {"gender": "female", "glasses": "sunglasses"}
    saved = client.put("/api/profile", headers=headers, json={**body, **chosen})
    assert saved.status_code == 200
    assert saved.json()["character"] | chosen == saved.json()["character"]
    assert client.get("/api/profile").json()["character"] | chosen == saved.json()["character"]
    for bad in ({"gender": "robot"}, {"glasses": "monocle"}):
        assert client.put("/api/profile", headers=headers, json={**body, **bad}).status_code == 422


def test_startup_adds_new_profile_columns_to_an_old_database(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    with engine.begin() as connection:
        # The profiles table as deployed before the gender and glasses columns existed
        connection.execute(
            text(
                "CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, name VARCHAR(24), "
                "hair_color VARCHAR(7), skin_color VARCHAR(7), eye_color VARCHAR(7), "
                "major VARCHAR(32), onboarding_stage VARCHAR(16))"
            )
        )
        connection.execute(
            text(
                "INSERT INTO profiles VALUES "
                "(1, 'Ada', '#000000', '#000000', '#000000', 'x', 'main')"
            )
        )
    monkeypatch.setattr(database, "engine", engine)

    database.add_missing_columns()
    database.add_missing_columns()  # idempotent

    with engine.connect() as connection:
        row = connection.execute(text("SELECT gender, glasses FROM profiles")).one()
        assert tuple(row) == ("unspecified", "none")
    engine.dispose()
