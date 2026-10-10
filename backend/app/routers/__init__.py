"""Collects every feature router under /api. Register new routers here."""

from fastapi import APIRouter

from app.routers import health, items, leaderboard, runs

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(items.router)

# --- shell ---
api_router.include_router(runs.router)
api_router.include_router(leaderboard.router)
