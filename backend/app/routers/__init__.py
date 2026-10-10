"""Collects every feature router under /api. Register new routers here."""

from fastapi import APIRouter

from app.routers import accounts, avatar, health, leaderboard, runs, story

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
# --- runs ---
api_router.include_router(runs.router)
# --- leaderboard ---
api_router.include_router(leaderboard.router)
# --- story ---
api_router.include_router(story.router)
# --- account shell ---
api_router.include_router(accounts.router)
# --- avatar ---
api_router.include_router(avatar.router)
