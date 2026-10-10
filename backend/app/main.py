"""App entry point: `uvicorn app.main:app --reload` (run from backend/)."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError

from app.config import settings
from app.frontend import mount_frontend
from app.routers import api_router

if settings.environment == "production":
    app = FastAPI(title=settings.app_name, docs_url=None, redoc_url=None, openapi_url=None)
else:
    app = FastAPI(title=settings.app_name)


@app.exception_handler(RedisError)
def storage_unavailable(_request: Request, _error: RedisError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"detail": "Storage is unavailable, try again in a moment"},
    )


app.include_router(api_router)
mount_frontend(app)  # keep last: its page route is a catch-all
