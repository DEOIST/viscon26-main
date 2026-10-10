"""HTTP layer for the AI avatar creator: one photo in, suggested character colors out."""

from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, status

from app.config import settings
from app.schemas import AvatarPhoto, AvatarSuggestion
from app.services import avatar as avatar_service

router = APIRouter(prefix="/avatar", tags=["avatar"])


@router.post("/suggestion")
def suggest_from_photo(body: AvatarPhoto, request: Request) -> AvatarSuggestion:
    # Keep the cross-origin credit-spending guard without accounts or cookies.
    origin = request.headers.get("origin")
    if origin and not _is_allowed_origin(origin, request.headers.get("host")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Request origin is not allowed.")
    # Always 200: when the AI is unavailable the suggestion is empty (source="fallback").
    return avatar_service.suggest_from_photo(body.image)


def _is_allowed_origin(origin: str, host: str | None) -> bool:
    # Our own page is always allowed, whatever domain the VM is reached on: Caddy and the Vite
    # proxy (changeOrigin: false) pass the browser's Host through, and a foreign site can't fake it.
    if host and urlsplit(origin).netloc == host:
        return True
    return origin.rstrip("/") in settings.allowed_origins
