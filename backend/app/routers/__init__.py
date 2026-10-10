"""Collects every feature router under /api. Register new routers here."""

from fastapi import APIRouter

from app.routers import cv, health, leaderboard, runs, story

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
# --- runs ---
api_router.include_router(runs.router)
# --- leaderboard ---
api_router.include_router(leaderboard.router)
# --- story ---
api_router.include_router(story.router)
# --- cv ---
api_router.include_router(cv.router)
