"""Account authentication and idempotent shell progression, independent of HTTP."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from pwdlib import PasswordHash
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Completion, LoginSession, Profile, User
from app.schemas import (
    AccountIdentity,
    Credentials,
    ProfileInput,
    ScoreboardEntry,
    ShellCharacter,
    ShellProfile,
    ShellProgress,
    ShellSession,
)
from app.shell_config import GAMES, YEARS, can_graduate, earned_ects, year_unlocked

SESSION_SECONDS = 7 * 24 * 60 * 60
COOKIE = "eth_session"
passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("not-a-real-account")


def database_health(db: Session) -> None:
    db.execute(text("SELECT 1"))


class AccountError(Exception):
    def __init__(self, message: str, kind: str = "conflict") -> None:
        super().__init__(message)
        self.kind = kind


def token_hash(token: str) -> str:
    return hmac.new(
        settings.session_secret.get_secret_value().encode(), token.encode(), hashlib.sha256
    ).hexdigest()


def current_session(db: Session, token: str | None) -> LoginSession | None:
    if not token:
        return None
    return db.scalar(
        select(LoginSession).where(
            LoginSession.token_hash == token_hash(token),
            LoginSession.expires_at > datetime.now(UTC),
        )
    )


def new_session(
    db: Session, old: LoginSession | None, user_id: int | None = None
) -> tuple[LoginSession, str]:
    if old:
        db.delete(old)
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= datetime.now(UTC)))
    token = secrets.token_urlsafe(32)
    session = LoginSession(
        token_hash=token_hash(token),
        user_id=user_id,
        csrf_token=secrets.token_hex(32),
        expires_at=datetime.now(UTC) + timedelta(seconds=SESSION_SECONDS),
    )
    db.add(session)
    db.commit()
    return session, token


def profile_data(profile: Profile | None) -> ShellProfile | None:
    if not profile:
        return None
    return ShellProfile(
        name=profile.name,
        character=ShellCharacter(
            hair_color=profile.hair_color,
            skin_color=profile.skin_color,
            eye_color=profile.eye_color,
            gender=profile.gender,
            glasses=profile.glasses,
            hair_length=profile.hair_length,
        ),
        major=profile.major,
        onboarding_stage=profile.onboarding_stage,
    )


def completed_ids(db: Session, user_id: int) -> set[str]:
    return {
        key
        for key in db.scalars(select(Completion.game_id).where(Completion.user_id == user_id))
        if key in GAMES and GAMES[key]["implemented"]
    }


def progress_data(db: Session, user: User) -> ShellProgress:
    completed = completed_ids(db, user.id)
    return ShellProgress(
        completed_game_ids=sorted(completed),
        graduated=user.graduated_at is not None,
        ects=earned_ects(completed),
    )


def session_data(db: Session, session: LoginSession) -> ShellSession:
    user = db.get(User, session.user_id) if session.user_id else None
    return ShellSession(
        user=AccountIdentity(id=user.id) if user else None,
        csrf_token=session.csrf_token,
        profile=profile_data(db.get(Profile, user.id)) if user else None,
        progress=progress_data(db, user) if user else ShellProgress(),
    )


def register(db: Session, body: Credentials) -> User:
    user = User(
        login_identifier=body.identifier.lower(), password_hash=passwords.hash(body.password)
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise AccountError("That username is already taken.") from error
    return user


def login(db: Session, body: Credentials) -> User:
    user = db.scalar(select(User).where(User.login_identifier == body.identifier.lower()))
    valid = passwords.verify(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise AccountError("Username or password is incorrect.", "unauthorized")
    return user


def get_profile(db: Session, user: User) -> ShellProfile | None:
    return profile_data(db.get(Profile, user.id))


def save_profile(db: Session, user: User, body: ProfileInput) -> ShellProfile:
    profile = db.get(Profile, user.id) or Profile(user_id=user.id)
    profile.name = body.name
    # All supported legacy values represent the same department; existing rows are untouched.
    profile.major = "Computer Science"
    profile.hair_color, profile.skin_color, profile.eye_color = (
        body.hair_color,
        body.skin_color,
        body.eye_color,
    )
    profile.gender, profile.glasses = body.gender, body.glasses
    profile.hair_length = body.hair_length
    profile.onboarding_stage = body.onboarding_stage
    db.add(profile)
    db.commit()
    return profile_data(profile)


def get_progress(db: Session, user: User) -> ShellProgress:
    return progress_data(db, user)


def complete_game(db: Session, user: User, game_id: str) -> ShellProgress:
    game = GAMES.get(game_id)
    if not game:
        raise AccountError("Unknown minigame.", "not_found")
    if not game["implemented"]:
        raise AccountError("This placeholder cannot award ECTS.")
    # Refresh after taking the per-player lock, including a concurrent graduation change.
    user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    profile = db.get(Profile, user.id)
    if not profile or profile.onboarding_stage != "main":
        raise AccountError("Finish onboarding before playing.")
    completed = completed_ids(db, user.id)
    if game_id in completed:
        return progress_data(db, user)
    index = next(i for i, year in enumerate(YEARS) if game in year["games"])
    if not year_unlocked(index, completed):
        raise AccountError("Complete every minigame in the previous years first.")
    db.add(Completion(user_id=user.id, game_id=game_id, completed_at=datetime.now(UTC)))
    db.commit()
    return progress_data(db, user)


def graduate(db: Session, user: User) -> ShellProgress:
    user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not can_graduate(completed_ids(db, user.id)):
        raise AccountError("Complete all three years and earn every required ECTS first.")
    if not user.graduated_at:
        user.graduated_at = datetime.now(UTC)
        db.commit()
    return progress_data(db, user)


def scoreboard(db: Session) -> list[ScoreboardEntry]:
    profiles = db.execute(select(User, Profile).join(Profile, Profile.user_id == User.id)).all()
    completions: dict[int, set[str]] = {}
    for user_id, game_id in db.execute(select(Completion.user_id, Completion.game_id)):
        completions.setdefault(user_id, set()).add(game_id)
    rows = [
        (
            user.id,
            ScoreboardEntry(
                name=profile.name,
                major=profile.major,
                ects=earned_ects(completions.get(user.id, set())),
                graduated=user.graduated_at is not None,
            ),
        )
        for user, profile in profiles
    ]
    rows.sort(key=lambda row: (-row[1].ects, row[0]))
    return [row for _, row in rows[:100]]
