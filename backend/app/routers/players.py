"""Anonymous browser-run API; identifiers identify records, not a verified person."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas import HealthStatus, ProfileInput, ScoreboardEntry, ShellPlayer, ShellProgress
from app.services import players as players_service

router = APIRouter(tags=["players"])
Db = Annotated[Session, Depends(get_db)]


@router.get("/db-health", tags=["health"])
def get_database_health(db: Db) -> HealthStatus:
    players_service.database_health(db)
    return HealthStatus(status="ok", environment=settings.environment)


@router.get("/players/{player_id}")
def get_player(player_id: UUID, db: Db) -> ShellPlayer:
    return players_service.player_data(db, players_service.get_player(db, str(player_id)))


@router.put("/players/{player_id}")
def save_profile(player_id: UUID, body: ProfileInput, db: Db) -> ShellPlayer:
    return players_service.save_profile(db, str(player_id), body)


@router.post("/players/{player_id}/completions/{game_id}")
def complete_game(player_id: UUID, game_id: str, db: Db) -> ShellProgress:
    return players_service.complete_game(
        db, players_service.get_player(db, str(player_id)), game_id
    )


@router.post("/players/{player_id}/graduation")
def graduate(player_id: UUID, db: Db) -> ShellProgress:
    return players_service.graduate(db, players_service.get_player(db, str(player_id)))


@router.get("/scoreboard")
def scoreboard(db: Db) -> list[ScoreboardEntry]:
    return players_service.scoreboard(db)
