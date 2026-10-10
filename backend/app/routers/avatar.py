"""HTTP layer for the AI avatar creator: one photo in, suggested character colors out."""

from fastapi import APIRouter

from app.routers.accounts import CsrfSession
from app.schemas import AvatarPhoto, AvatarSuggestion
from app.services import avatar as avatar_service

router = APIRouter(prefix="/avatar", tags=["avatar"])


@router.post("/suggestion")
def suggest_from_photo(body: AvatarPhoto, _csrf: CsrfSession) -> AvatarSuggestion:
    # POST + CSRF: only the page itself can spend credits, never a link or another site.
    # Always 200: when the AI is unavailable the suggestion is empty (source="fallback").
    return avatar_service.suggest_from_photo(body.image)
