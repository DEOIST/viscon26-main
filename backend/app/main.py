"""App entry point: `uvicorn app.main:app --reload` (run from backend/)."""

from fastapi import FastAPI

from app.config import settings
from app.frontend import mount_frontend
from app.routers import api_router

if settings.environment == "production":
    app = FastAPI(title=settings.app_name, docs_url=None, redoc_url=None, openapi_url=None)
else:
    app = FastAPI(title=settings.app_name)

app.include_router(api_router)
mount_frontend(app)  # keep last: its page route is a catch-all
