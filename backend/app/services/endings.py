"""Scores → career. Pure functions; the tiers live in shared/game-config.json (GAME_DESIGN.md)."""

import math
from collections.abc import Mapping

from app.game_config import CONFIG
from app.schemas import Ending, GameId
from app.text import TEXT

# Best first, so the first tier whose threshold the percentage reaches wins.
ENDING_TIERS = sorted(CONFIG["endings"], key=lambda tier: -tier["minPercent"])
if ENDING_TIERS[-1]["minPercent"] != 0:
    raise RuntimeError("The worst ending must start at 0 %")


def total_score(scores: Mapping[GameId, int]) -> int:
    """Average of the minigame scores, rounded half up (85.5 → 86, unlike Python's round())."""
    return math.floor(sum(scores.values()) / len(scores) + 0.5)


def decide_ending(percent: int) -> Ending:
    """`percent` is a 0–100 share: a run's average score, or a player's share of the ECTS."""
    tier = next(tier for tier in ENDING_TIERS if percent >= tier["minPercent"])
    return Ending(id=tier["id"], title=TEXT["endings"][tier["id"]]["title"])
