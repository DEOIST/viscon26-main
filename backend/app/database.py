"""Anonymous shell persistence, with an additive migration for previous account records."""

from collections.abc import Iterator
from datetime import datetime

from sqlalchemy import (
    URL,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    UniqueConstraint,
    create_engine,
    exists,
    insert,
    inspect,
    literal,
    select,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.config import settings

database_url = settings.database_url.get_secret_value() or URL.create(
    "postgresql+psycopg",
    username=settings.postgres_user,
    password=settings.postgres_password.get_secret_value(),
    host=settings.postgres_host,
    port=settings.postgres_port,
    database=settings.postgres_db,
)
engine = create_engine(database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Player(Base):
    __tablename__ = "players"
    id: Mapped[int] = mapped_column(primary_key=True)
    anonymous_id: Mapped[str | None] = mapped_column(String(36), unique=True)
    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Profile(Base):
    __tablename__ = "player_profiles"
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    name: Mapped[str] = mapped_column(String(24))
    hair_color: Mapped[str] = mapped_column(String(7))
    skin_color: Mapped[str] = mapped_column(String(7))
    eye_color: Mapped[str] = mapped_column(String(7))
    gender: Mapped[str] = mapped_column(
        String(16), default="unspecified", server_default="unspecified"
    )
    glasses: Mapped[str] = mapped_column(String(16), default="none", server_default="none")
    hair_length: Mapped[str] = mapped_column(String(8), default="short", server_default="short")
    major: Mapped[str] = mapped_column(String(32))
    onboarding_stage: Mapped[str] = mapped_column(String(16))


class Completion(Base):
    __tablename__ = "player_completions"
    __table_args__ = (UniqueConstraint("player_id", "game_id", name="uq_player_game"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), index=True)
    game_id: Mapped[str] = mapped_column(String(80))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # 0–100 from the minigame; NULL for completions saved before scores existed (full ECTS).
    score: Mapped[int | None] = mapped_column(Integer)


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


def add_completion_scores() -> None:
    """create_all() never alters an existing table: add the score column to older databases."""
    with engine.begin() as connection:
        schema = connection.schema_for_object(Completion.__table__)
        columns = inspect(connection).get_columns(Completion.__tablename__, schema=schema)
        if all(column["name"] != "score" for column in columns):
            quote = connection.dialect.identifier_preparer.quote
            table_name = (
                f"{quote(schema)}.{quote(Completion.__tablename__)}"
                if schema
                else quote(Completion.__tablename__)
            )
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN score INTEGER"))


def migrate_legacy_players() -> None:
    """Copy existing results without altering or deleting legacy tables or credentials.

    Legacy rows have no browser identifier: a display name never grants access to a run.
    Keeping numeric IDs also preserves leaderboard tie ordering.
    """
    defaults = {"gender": "unspecified", "glasses": "none", "hair_length": "short"}
    copies = [
        ("users", Player.__table__, {"id": "id", "graduated_at": "graduated_at"}),
        ("profiles", Profile.__table__, {"player_id": "user_id"}),
        ("completions", Completion.__table__, {"player_id": "user_id"}),
    ]
    with engine.begin() as connection:
        schema = connection.schema_for_object(Player.__table__)
        tables = set(inspect(connection).get_table_names(schema=schema))
        for old_name, target, renamed in copies:
            if old_name not in tables:
                continue
            source = Table(old_name, MetaData(), schema=schema, autoload_with=connection)
            columns = [
                column for column in target.columns if column.name not in ("anonymous_id", "score")
            ]
            values = [
                source.c[renamed.get(column.name, column.name)]
                if renamed.get(column.name, column.name) in source.c
                else literal(defaults[column.name])
                for column in columns
            ]
            primary_key = next(iter(target.primary_key))
            source_key = source.c[renamed.get(primary_key.name, primary_key.name)]
            missing = ~exists(select(1).where(primary_key == source_key))
            copied = connection.execute(
                insert(target).from_select(
                    [column.name for column in columns], select(*values).where(missing)
                )
            )
            if connection.dialect.name == "postgresql" and copied.rowcount and "id" in target.c:
                quote = connection.dialect.identifier_preparer.quote
                table_name = (
                    f"{quote(schema)}.{quote(target.name)}" if schema else quote(target.name)
                )
                connection.execute(
                    text(
                        "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), "
                        f"COALESCE((SELECT MAX(id) FROM {table_name}), 1), "
                        f"EXISTS(SELECT 1 FROM {table_name}))"
                    ),
                    {"table_name": table_name},
                )
