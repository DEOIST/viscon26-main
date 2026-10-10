"""App entry point: `uvicorn app.main:app --reload` (run from backend/)."""

import logging

import redis
from fastapi import FastAPI, Request, status
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.frontend import mount_frontend
from app.routers import api_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

if settings.environment == "production":
    app = FastAPI(title=settings.app_name, docs_url=None, redoc_url=None, openapi_url=None)
else:
    app = FastAPI(title=settings.app_name)

# The shooter page downloads ~20 MB of MediaPipe files; compressing them matters on venue wifi.
app.add_middleware(GZipMiddleware, minimum_size=1024)


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
