"""HTTP layer for the Hall of Fame and the ending statistics."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.schemas import EndingStats, LeaderboardEntry
from app.services import leaderboard as leaderboard_service

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("")
def list_leaderboard(limit: Annotated[int, Query(ge=1, le=50)] = 10) -> list[LeaderboardEntry]:
    return leaderboard_service.list_leaderboard(limit)


@router.get("/endings")
def get_ending_stats() -> EndingStats:
    return leaderboard_service.get_ending_stats()
