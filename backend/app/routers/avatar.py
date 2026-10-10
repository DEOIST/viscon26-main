"""HTTP layer for the AI avatar creator: one photo in, suggested character colors out."""

from fastapi import APIRouter, HTTPException, Request, status

from app.config import settings
from app.schemas import AvatarPhoto, AvatarSuggestion
from app.services import avatar as avatar_service

router = APIRouter(prefix="/avatar", tags=["avatar"])


@router.post("/suggestion")
def suggest_from_photo(body: AvatarPhoto, request: Request) -> AvatarSuggestion:
    # Keep the cross-origin credit-spending guard without accounts or cookies.
    origin = request.headers.get("origin")
    if origin and origin not in settings.allowed_origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Request origin is not allowed.")
    # Always 200: when the AI is unavailable the suggestion is empty (source="fallback").
    return avatar_service.suggest_from_photo(body.image)
