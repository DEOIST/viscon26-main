"""Cookie/CSRF boundary for the independent account shell API."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import LoginSession, User, get_db
from app.schemas import (
    Credentials,
    HealthStatus,
    ProfileInput,
    ScoreboardEntry,
    ShellProfile,
    ShellProgress,
    ShellSession,
)
from app.services import accounts as accounts_service

router = APIRouter(tags=["accounts"])
Db = Annotated[Session, Depends(get_db)]


def current_session(request: Request, db: Db) -> LoginSession | None:
    return accounts_service.current_session(db, request.cookies.get(accounts_service.COOKIE))


def csrf(request: Request, db: Db) -> LoginSession:
    session = current_session(request, db)
    origin = request.headers.get("origin")
    if origin and origin not in settings.allowed_origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Request origin is not allowed.")
    supplied = request.headers.get("x-csrf-token", "")
    if not session or not hmac.compare_digest(session.csrf_token, supplied):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Your session expired. Refresh and try again."
        )
    return session


def require_user(request: Request, db: Db) -> User:
    session = current_session(request, db)
    user = db.get(User, session.user_id) if session and session.user_id else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again.")
    return user


Account = Annotated[User, Depends(require_user)]
CsrfSession = Annotated[LoginSession, Depends(csrf)]


def rotate_session(
    response: Response, db: Session, old: LoginSession | None, user_id: int | None = None
) -> ShellSession:
    session, token = accounts_service.new_session(db, old, user_id)
    response.set_cookie(
        accounts_service.COOKIE,
        token,
        max_age=accounts_service.SESSION_SECONDS,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api",
    )
    return accounts_service.session_data(db, session)


@router.get("/db-health", tags=["health"])
def get_database_health(db: Db) -> HealthStatus:
    accounts_service.database_health(db)
    return HealthStatus(status="ok", environment=settings.environment)


@router.get("/session")
def get_session(request: Request, response: Response, db: Db) -> ShellSession:
    session = current_session(request, db)
    if not session:
        return rotate_session(response, db, None)
    return accounts_service.session_data(db, session)


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: Credentials, response: Response, db: Db, session: CsrfSession) -> ShellSession:
    user = accounts_service.register(db, body)
    return rotate_session(response, db, session, user.id)


@router.post("/login")
def login(body: Credentials, response: Response, db: Db, session: CsrfSession) -> ShellSession:
    user = accounts_service.login(db, body)
    return rotate_session(response, db, session, user.id)


@router.post("/logout")
def logout(response: Response, db: Db, session: CsrfSession) -> ShellSession:
    return rotate_session(response, db, session)


@router.get("/profile")
def get_profile(db: Db, user: Account) -> ShellProfile | None:
    return accounts_service.get_profile(db, user)


@router.put("/profile")
def save_profile(body: ProfileInput, db: Db, user: Account, _csrf: CsrfSession) -> ShellProfile:
    return accounts_service.save_profile(db, user, body)


@router.get("/progress")
def get_progress(db: Db, user: Account) -> ShellProgress:
    return accounts_service.get_progress(db, user)


@router.post("/completions/{game_id}")
def complete_game(game_id: str, db: Db, user: Account, _csrf: CsrfSession) -> ShellProgress:
    return accounts_service.complete_game(db, user, game_id)


@router.post("/graduation")
def graduate(db: Db, user: Account, _csrf: CsrfSession) -> ShellProgress:
    return accounts_service.graduate(db, user)


@router.get("/scoreboard")
def scoreboard(db: Db) -> list[ScoreboardEntry]:
    return accounts_service.scoreboard(db)
