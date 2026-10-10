"""PostgreSQL persistence for accounts, opaque sessions and shell progress."""

from collections.abc import Iterator
from datetime import datetime

from sqlalchemy import URL, DateTime, ForeignKey, String, UniqueConstraint, create_engine
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


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    login_identifier: Mapped[str] = mapped_column(String(48), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Profile(Base):
    __tablename__ = "profiles"
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    name: Mapped[str] = mapped_column(String(24))
    hair_color: Mapped[str] = mapped_column(String(7))
    skin_color: Mapped[str] = mapped_column(String(7))
    eye_color: Mapped[str] = mapped_column(String(7))
    major: Mapped[str] = mapped_column(String(32))
    onboarding_stage: Mapped[str] = mapped_column(String(16))


class Completion(Base):
    __tablename__ = "completions"
    __table_args__ = (UniqueConstraint("user_id", "game_id", name="uq_user_game"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    game_id: Mapped[str] = mapped_column(String(80))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db
