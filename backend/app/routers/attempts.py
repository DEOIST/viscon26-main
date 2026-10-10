"""HTTP layer for a signed-in player's attempt history and activity graph."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.routers.accounts import Account, CsrfSession, Db
from app.schemas import ActivitySummary, Attempt, AttemptInput, TimeZoneName
from app.services import attempts as attempts_service

router = APIRouter(tags=["attempts"])


@router.post("/attempts", status_code=status.HTTP_201_CREATED)
def record_attempt(body: AttemptInput, db: Db, user: Account, _csrf: CsrfSession) -> Attempt:
    return attempts_service.record_attempt(db, user, body)


@router.get("/attempts")
def list_attempts(
    db: Db, user: Account, limit: Annotated[int, Query(ge=1, le=100)] = 20
) -> list[Attempt]:
    return attempts_service.list_attempts(db, user, limit)


@router.get("/activity")
def get_activity(db: Db, user: Account, tz: TimeZoneName = "UTC") -> ActivitySummary:
    return attempts_service.get_activity(db, user, tz)
