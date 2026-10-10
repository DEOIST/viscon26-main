"""Anonymous shell regression checks; no application database records are touched."""

import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    func,
    inspect,
    select,
    text,
)
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import database
from app.config import settings
from app.database import Completion, Player, Profile, get_db
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


@pytest.fixture
def placeholder_games(monkeypatch):
    """Every game as a placeholder, whichever games shared/game-config.json has switched on."""
    for game in GAMES.values():
        monkeypatch.setitem(game, "implemented", False)


def player_path() -> str:
    return f"/api/players/{uuid.uuid4()}"


def profile_body(name="  Ada  ", stage="main"):
    return {
        "name": name,
        "hairColor": CONFIG["colors"]["hair"][0]["value"],
        "skinColor": CONFIG["colors"]["skin"][0]["value"],
        "eyeColor": CONFIG["colors"]["eyes"][0]["value"],
        "major": CONFIG["major"],
        "onboardingStage": stage,
    }


def profile(client, path, name="  Ada  "):
    response = client.put(path, json=profile_body(name))
    assert response.status_code == 200
    assert response.json()["profile"]["name"] == name.strip()
    assert "set-cookie" not in response.headers
    return response.json()


def test_rejects_out_of_order_completion(client, connected_games):
    path = player_path()
    profile(client, path)
    second = YEARS[1]["games"][0]["id"]
    assert client.post(f"{path}/completions/{second}").status_code == 409
    assert client.get(path).json()["progress"]["ects"] == 0


def test_idempotency_ects_and_graduation(client, connected_games):
    path = player_path()
    profile(client, path)
    assert client.post(f"{path}/graduation").status_code == 409
    first = YEARS[0]["games"][0]["id"]
    graduated = None
    for _ in range(2):
        response = client.post(f"{path}/completions/{first}", json={"ects": 999})
        assert response.status_code == 200
        assert response.json()["ects"] == YEARS[0]["ects"]
        assert response.json()["completedGameIds"] == [first]
    for year in YEARS[1:]:
        for game in year["games"]:
            assert client.post(f"{path}/completions/{game['id']}").status_code == 200
    for _ in range(2):
        response = client.post(f"{path}/graduation")
        assert response.status_code == 200
        assert response.json()["graduated"] is True
        assert response.json()["ects"] == CONFIG["totalEcts"]
        assert response.json()["graduatedAt"] is not None
        if graduated:
            assert response.json() == graduated
        graduated = response.json()
    assert len(client.get(path).json()["progress"]["completedGameIds"]) == len(GAMES)
    assert client.get(path).json()["progress"] == graduated
    profile(client, path)
    assert client.get(path).json()["progress"] == graduated
    assert len(client.get("/api/scoreboard").json()) == 1
    with next(app.dependency_overrides[get_db]()) as db:
        assert db.scalar(select(func.count()).select_from(Completion)) == len(GAMES)


def test_placeholder_and_unknown_games_cannot_earn_credits(client, placeholder_games):
    path = player_path()
    profile(client, path)
    assert client.post(f"{path}/completions/year-2-slot").status_code == 409
    assert client.post(f"{path}/completions/invented").status_code == 404
    assert client.get("/api/scoreboard").json()[0]["ects"] == 0


def test_shipped_minigames_complete_all_three_years(client):
    # The real configuration: shooter is Year 1, blackjack Year 2, the thesis defense Year 3.
    assert all(GAMES[f"year-{year}-slot"]["implemented"] is True for year in (1, 2, 3))
    assert [year["games"][0]["title"] for year in YEARS] == [
        "Introduction to Programming - Bug Bash",
        "Probability Class - Gauss Jack",
        "Thesis defense",
    ]
    path = player_path()
    profile(client, path)
    progress = client.post(f"{path}/completions/year-1-slot").json()
    assert progress["ects"] == YEARS[0]["ects"]
    response = client.post(f"{path}/completions/year-2-slot")
    assert response.status_code == 200
    assert response.json()["ects"] == 120
    assert response.json()["completedGameIds"] == ["year-1-slot", "year-2-slot"]
    third = client.post(f"{path}/completions/year-3-slot")
    assert third.status_code == 200
    assert third.json()["ects"] == 180


def test_no_account_cookie_or_registration_is_needed(client):
    path = player_path()
    assert client.get(path).status_code == 404
    result = profile(client, path)
    assert client.get(path).json() == result
    assert result["id"] == path.rsplit("/", 1)[1]
    assert result["progress"] == {
        "completedGameIds": [],
        "scores": {},
        "graduated": False,
        "graduatedAt": None,
        "ects": 0,
    }
    for method, endpoint in (
        ("GET", "session"),
        ("POST", "login"),
        ("POST", "register"),
        ("POST", "logout"),
    ):
        assert client.request(method, f"/api/{endpoint}").status_code == 404
    assert client.get("/api/scoreboard").json() == [
        {"name": "Ada", "major": "Computer Science", "ects": 0, "graduated": False}
    ]


def test_acceptance_and_invalid_player_ids_cannot_play(client):
    path = player_path()
    assert client.put(path, json=profile_body(stage="acceptance")).status_code == 200
    assert client.post(f"{path}/completions/year-1-slot").status_code == 409
    assert client.post(f"{path}/graduation").status_code == 409
    assert client.get("/api/players/not-a-uuid").status_code == 422
    assert client.post(f"{player_path()}/graduation").status_code == 404
    assert client.get(path).json()["progress"]["ects"] == 0


@pytest.mark.parametrize("enabled", [False, True])
def test_preview_switch_never_bypasses_graduation_or_awards_credits(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, enabled: bool
) -> None:
    monkeypatch.setattr(settings, "graduation_preview", enabled)
    path = player_path()
    saved = profile(client, path)

    assert client.get("/api/config").json() == {"graduationPreview": enabled}
    assert client.post(f"{path}/graduation").status_code == 409
    assert client.get(path).json() == saved
    assert client.get("/api/scoreboard").json() == [
        {"name": "Ada", "major": "Computer Science", "ects": 0, "graduated": False}
    ]


def test_profile_validation_and_extra_reward_input(client):
    path = player_path()
    data = {
        "name": " ",
        "hairColor": "#000000",
        "skinColor": "#FFFFFF",
        "eyeColor": "#000000",
        "onboardingStage": "main",
    }
    assert client.put(path, json=data).status_code == 422
    assert client.post(f"{path}/completions/year-1-slot", json={"ects": 999}).status_code == 404
    assert client.get(path).status_code == 404


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
    path = player_path()
    profile(client, path)
    assert client.post(f"{path}/completions/{first['id']}").json()["ects"] == 30
    assert client.post(f"{path}/completions/year-2-slot").status_code == 409
    assert client.post(f"{path}/completions/{extra['id']}").json()["ects"] == 60
    assert client.post(f"{path}/completions/year-2-slot").status_code == 200


def test_duplicate_names_are_independent_and_scoreboard_keeps_ects_order(client, connected_games):
    first, second = player_path(), player_path()
    profile(client, first, "Same student")
    profile(client, second, "Same student")
    for _ in range(2):
        assert client.post(f"{second}/completions/year-1-slot").status_code == 200
    assert [row["ects"] for row in client.get("/api/scoreboard").json()] == [60, 0]
    assert [row["name"] for row in client.get("/api/scoreboard").json()] == ["Same student"] * 2
    assert client.get(first).json()["progress"]["ects"] == 0
    assert client.get(second).json()["progress"]["ects"] == 60
    # Profile saves and reloads reuse the browser identifier instead of creating a new row.
    profile(client, second, "Renamed student")
    assert len(client.get("/api/scoreboard").json()) == 2
    assert client.get(second).json()["progress"]["ects"] == 60
    assert [row["name"] for row in client.get("/api/scoreboard").json()] == [
        "Renamed student",
        "Same student",
    ]


def test_scoreboard_ties_use_creation_order(client):
    first, second = player_path(), player_path()
    profile(client, first, "First student")
    profile(client, second, "Second student")
    assert [row["name"] for row in client.get("/api/scoreboard").json()] == [
        "First student",
        "Second student",
    ]


@pytest.mark.parametrize("major", ["Computer Science", "D-INFK", "infk"])
def test_department_aliases_save_without_resetting_progress(client, connected_games, major):
    path = player_path()
    profile(client, path)
    assert client.post(f"{path}/completions/year-1-slot").status_code == 200
    data = client.get(path).json()["profile"]
    response = client.put(
        path,
        json={
            "name": data["name"],
            **data["character"],
            "major": major,
            "onboardingStage": "main",
        },
    )
    assert response.status_code == 200
    assert response.json()["profile"]["major"] == "Computer Science"
    assert client.get(path).json()["progress"]["ects"] == 60


def test_reading_a_legacy_major_does_not_rewrite_it(client):
    path = player_path()
    result = profile(client, path)
    with next(app.dependency_overrides[get_db]()) as db:
        player = db.scalar(select(Player).where(Player.anonymous_id == result["id"]))
        saved = db.get(Profile, player.id)
        saved.major = "D-INFK"
        db.commit()
    assert client.get(path).json()["profile"]["major"] == "D-INFK"


def test_database_health_reports_a_real_connection_failure(client, monkeypatch):
    from sqlalchemy.exc import OperationalError

    from app.services import players

    assert client.get("/api/db-health").status_code == 200

    def unavailable(_db):
        raise OperationalError("SELECT 1", {}, Exception("offline"))

    monkeypatch.setattr(players, "database_health", unavailable)
    assert client.get("/api/db-health").status_code == 503
    assert client.get("/api/health").status_code == 200


def test_gender_and_glasses_are_saved_with_defaults(client):
    path = player_path()
    profile(client, path)
    character = client.get(path).json()["profile"]["character"]
    assert (character["gender"], character["glasses"], character["hairLength"]) == (
        "unspecified",
        "none",
        "short",
    )

    body = {
        "name": "Ada",
        "hairColor": CONFIG["colors"]["hair"][0]["value"],
        "skinColor": CONFIG["colors"]["skin"][0]["value"],
        "eyeColor": CONFIG["colors"]["eyes"][0]["value"],
        "onboardingStage": "main",
    }
    chosen = {"gender": "female", "glasses": "sunglasses", "hairLength": "long"}
    saved = client.put(path, json={**body, **chosen})
    assert saved.status_code == 200
    assert saved.json()["profile"]["character"] | chosen == saved.json()["profile"]["character"]
    assert (
        client.get(path).json()["profile"]["character"] | chosen
        == saved.json()["profile"]["character"]
    )
    for bad in ({"gender": "robot"}, {"glasses": "monocle"}, {"hairLength": "medium"}):
        assert client.put(path, json={**body, **bad}).status_code == 422


def test_fresh_database_has_only_anonymous_tables(client):
    with database.engine.connect() as connection:
        schema = connection.schema_for_object(Player.__table__)
    assert set(inspect(database.engine).get_table_names(schema=schema)) == {
        "players",
        "player_profiles",
        "player_completions",
    }


def test_legacy_migration_preserves_records_and_allows_anonymous_inserts(client):
    metadata = MetaData()
    users = Table(
        "users",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("login_identifier", String(48), nullable=False, unique=True),
        Column("password_hash", String(255), nullable=False),
        Column("graduated_at", DateTime(timezone=True)),
    )
    profiles = Table(
        "profiles",
        metadata,
        Column("user_id", Integer, primary_key=True),
        Column("name", String(24), nullable=False),
        Column("hair_color", String(7)),
        Column("skin_color", String(7)),
        Column("eye_color", String(7)),
        Column("major", String(32)),
        Column("onboarding_stage", String(16)),
    )
    completions = Table(
        "completions",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("user_id", Integer),
        Column("game_id", String(80)),
        Column("completed_at", DateTime(timezone=True)),
    )
    sessions = Table("sessions", metadata, Column("token_hash", String(64), primary_key=True))
    metadata.create_all(database.engine)
    with database.engine.begin() as connection:
        connection.execute(
            users.insert(),
            {
                "id": 41,
                "login_identifier": "old_login",
                "password_hash": "legacy-value",
                "graduated_at": datetime(2026, 1, 2, tzinfo=UTC),
            },
        )
        connection.execute(
            profiles.insert(),
            {
                "user_id": 41,
                "name": "Former student",
                "hair_color": "#000000",
                "skin_color": "#000000",
                "eye_color": "#000000",
                "major": "D-INFK",
                "onboarding_stage": "main",
            },
        )
        connection.execute(
            completions.insert(),
            {
                "id": 117,
                "user_id": 41,
                "game_id": "year-1-slot",
                "completed_at": datetime(2026, 1, 1, tzinfo=UTC),
            },
        )
        connection.execute(sessions.insert(), {"token_hash": "dormant-record"})
        original = {
            table.name: connection.execute(select(table)).all()
            for table in metadata.tables.values()
        }

    database.migrate_legacy_players()
    database.migrate_legacy_players()

    assert client.get("/api/scoreboard").json() == [
        {"name": "Former student", "major": "D-INFK", "ects": 60, "graduated": True}
    ]
    path = player_path()
    profile(client, path, "Former student")
    assert client.post(f"{path}/completions/year-1-slot").status_code == 200
    with next(app.dependency_overrides[get_db]()) as db:
        assert db.get(Player, 41).anonymous_id is None
        saved = db.scalar(select(Player).where(Player.anonymous_id == path.rsplit("/", 1)[1]))
        assert saved.id > 41
        assert db.scalar(select(func.max(Completion.id))) > 117
        assert db.scalar(select(func.count()).select_from(Completion)) == 2
    with database.engine.connect() as connection:
        for table in metadata.tables.values():
            assert connection.execute(select(table)).all() == original[table.name]


def test_scores_scale_the_ects_and_finishing_every_year_graduates(client, connected_games):
    path = player_path()
    profile(client, path)

    def complete(game: str, score: int):
        return client.post(f"{path}/completions/{game}", json={"score": score})

    assert complete("year-1-slot", 50).json()["ects"] == 30
    # 60 ECTS × 33 % = 19.8, rounded half up.
    assert complete("year-2-slot", 33).json()["ects"] == 50
    progress = complete("year-3-slot", 0).json()
    assert progress["ects"] == 50
    assert progress["scores"] == {"year-1-slot": 50, "year-2-slot": 33, "year-3-slot": 0}
    # The first result counts: a replay cannot buy back credits.
    assert complete("year-1-slot", 100).json()["ects"] == 50
    graduated = client.post(f"{path}/graduation")
    assert graduated.status_code == 200
    assert graduated.json()["graduated"] is True
    assert graduated.json()["ects"] == 50
    assert client.get("/api/scoreboard").json()[0]["ects"] == 50


def test_scores_outside_0_to_100_are_rejected(client, connected_games):
    path = player_path()
    profile(client, path)
    for score in (-1, 101, 50.5, "high"):
        response = client.post(f"{path}/completions/year-1-slot", json={"score": score})
        assert response.status_code == 422
    assert client.get(path).json()["progress"]["completedGameIds"] == []


def test_older_databases_gain_the_score_column_once(monkeypatch):
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Table(
        "player_completions",
        MetaData(),
        Column("id", Integer, primary_key=True),
        Column("player_id", Integer),
        Column("game_id", String(80)),
        Column("completed_at", DateTime(timezone=True)),
    ).create(engine)
    monkeypatch.setattr(database, "engine", engine)
    database.add_completion_scores()
    database.add_completion_scores()
    columns = [column["name"] for column in inspect(engine).get_columns("player_completions")]
    assert columns.count("score") == 1
    engine.dispose()
