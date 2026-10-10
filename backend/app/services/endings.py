"""Scores → career. Pure functions; the thresholds live here and nowhere else (GAME_DESIGN.md)."""

import math
from collections.abc import Mapping

from app.schemas import Ending, EndingId, GameId

# Best first: (ending, lowest average score that earns it, career title).
ENDING_TIERS: tuple[tuple[EndingId, int, str], ...] = (
    ("quant", 85, "Quant researcher in Zug"),
    ("phd", 65, "PhD student at ETH, year 7"),
    ("masters", 45, "Master's student at ETH (again)"),
    ("mcdonalds", 25, "McDonald's at Zürich HB"),
    ("homeless", 0, "Homeless in Zürich"),
)


def total_score(scores: Mapping[GameId, int]) -> int:
    """Average of the minigame scores, rounded half up (85.5 → 86, unlike Python's round())."""
    return math.floor(sum(scores.values()) / len(scores) + 0.5)


def decide_ending(total: int) -> Ending:
    for ending_id, threshold, title in ENDING_TIERS:
        if total >= threshold:
            return Ending(id=ending_id, title=title)
    raise ValueError(f"Total score {total} is below every tier")
