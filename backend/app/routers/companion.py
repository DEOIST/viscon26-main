"""HTTP layer for the dealer you can talk to. POST only: both endpoints may spend OpenAI credits."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import CompanionQuestion, CompanionReply, CompanionSpeechRequest
from app.services import companion as companion_service
from app.services import players as players_service

router = APIRouter(prefix="/players", tags=["companion"])
Db = Annotated[Session, Depends(get_db)]


@router.post("/{player_id}/companion")
def ask_companion(player_id: UUID, body: CompanionQuestion, db: Db) -> CompanionReply:
    player = players_service.player_data(db, players_service.get_player(db, str(player_id)))
    if player.profile is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Create your character first.")
    try:
        return companion_service.ask_companion(player.id, player.profile.name, body.question)
    except companion_service.CompanionLimitError as error:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(error)) from None


@router.post(
    "/{player_id}/companion/speech",
    response_class=Response,
    responses={200: {"content": {"audio/mpeg": {}, "audio/wav": {}}}},
)
def speak_companion(player_id: UUID, body: CompanionSpeechRequest, db: Db) -> Response:
    players_service.get_player(db, str(player_id))  # 404 for an unknown player
    try:
        audio = companion_service.speak_companion(str(player_id), body.reply_id)
    except companion_service.CompanionReplyNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That answer is too old to read aloud. Ask again."
        ) from None
    except companion_service.CompanionLimitError as error:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(error)) from None
    except companion_service.CompanionVoiceUnavailableError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "The dealer's voice is unavailable right now"
        ) from None
    return Response(content=audio.content, media_type=audio.media_type)
