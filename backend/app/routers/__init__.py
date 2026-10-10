"""Collects every feature router under /api. Register new routers here."""

from fastapi import APIRouter

from app.routers import avatar, health, leaderboard, players, runs, story
from level1 import router as level1

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
# --- runs ---
api_router.include_router(runs.router)
# --- leaderboard ---
api_router.include_router(leaderboard.router)
# --- story ---
api_router.include_router(story.router)
# --- anonymous shell ---
api_router.include_router(players.router)
# --- avatar ---
api_router.include_router(avatar.router)
# --- level 1: the shooter's finger-detection engine (backend/level1/) ---
api_router.include_router(level1.router)
