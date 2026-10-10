"""HTTP layer for story content. POST only: these endpoints may spend OpenAI credits, and are
idempotent per run because the service caches every result."""

from fastapi import APIRouter, HTTPException, Response, status

from app.schemas import DialoguePack, DialogueRequest, Epilogue
from app.services import story as story_service
from app.services.runs import RunStateError

router = APIRouter(prefix="/runs", tags=["story"])

RUN_NOT_FOUND = "Run not found"


@router.post("/{run_id}/dialogue")
def generate_dialogue(run_id: str, payload: DialogueRequest) -> DialoguePack:
    pack = story_service.generate_dialogue(run_id, payload.scene)
    if pack is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RUN_NOT_FOUND)
    return pack


@router.post("/{run_id}/epilogue")
def generate_epilogue(run_id: str) -> Epilogue:
    try:
        epilogue = story_service.generate_epilogue(run_id)
    except RunStateError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from None
    if epilogue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RUN_NOT_FOUND)
    return epilogue


@router.post(
    "/{run_id}/epilogue/speech",
    response_class=Response,
    responses={200: {"content": {"audio/mpeg": {}, "audio/wav": {}}}},
)
def generate_epilogue_speech(run_id: str) -> Response:
    try:
        audio = story_service.generate_epilogue_speech(run_id)
    except RunStateError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from None
    except story_service.NarratorUnavailableError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "The narrator is unavailable right now"
        ) from None
    if audio is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RUN_NOT_FOUND)
    return Response(content=audio.content, media_type=audio.media_type)
