"""App entry point: `uvicorn app.main:app --reload` (run from backend/)."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis
from fastapi import FastAPI, Request, status
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import RequestResponseEndpoint

from app import database
from app.config import settings
from app.frontend import mount_frontend
from app.routers import api_router
from app.services.players import PlayerError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    database.Base.metadata.create_all(database.engine)
    database.add_completion_scores()
    database.migrate_legacy_players()
    yield


if settings.environment == "production":
    app = FastAPI(
        title=settings.app_name, docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )
else:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

# The shooter page downloads ~20 MB of MediaPipe files; compressing them matters on venue wifi.
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def private_responses(request: Request, call_next: RequestResponseEndpoint) -> Response:
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(PlayerError)
def player_error(_request: Request, error: PlayerError) -> JSONResponse:
    code = {
        "not_found": status.HTTP_404_NOT_FOUND,
    }.get(error.kind, status.HTTP_409_CONFLICT)
    return JSONResponse(status_code=code, content={"detail": str(error)})


@app.exception_handler(SQLAlchemyError)
def database_unavailable(_request: Request, _error: SQLAlchemyError) -> JSONResponse:
    log.error("Player database unavailable")
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Player storage is unavailable, try again in a moment"},
    )


@app.exception_handler(redis.exceptions.ConnectionError)
@app.exception_handler(redis.exceptions.TimeoutError)
def storage_unavailable(_request: Request, error: Exception) -> JSONResponse:
    log.error("Redis unavailable: %s", error)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Storage is unavailable, try again in a moment"},
    )


app.include_router(api_router)
mount_frontend(app)  # keep last: its page route is a catch-all
