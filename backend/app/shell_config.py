"""The shell's sequential years; legacy run rewards remain in game_config.py."""

import json
import math
from collections.abc import Collection, Mapping
from pathlib import Path

CONFIG = json.loads(
    (Path(__file__).resolve().parents[2] / "shared/game-config.json").read_text(encoding="utf-8")
)
YEARS = CONFIG["years"]
GAMES = {game["id"]: game for year in YEARS for game in year["games"]}

if len(GAMES) != sum(len(year["games"]) for year in YEARS):
    raise RuntimeError("Duplicate shell game IDs")
if not all(
    year["games"] and sum(game["ects"] for game in year["games"]) == year["ects"] for year in YEARS
):
    raise RuntimeError("Configured games must total each year's ECTS")
if not all(game["ects"] > 0 for game in GAMES.values()):
    raise RuntimeError("Configured game rewards must be positive")
if sum(year["ects"] for year in YEARS) != CONFIG["totalEcts"]:
    raise RuntimeError("Configured years must total the degree's ECTS")


def earned_ects(scores: Mapping[str, int | None]) -> int:
    """Each completed game pays its ECTS in proportion to its 0–100 score, rounded half up.

    `scores` maps completed game ids to their score; None (completions saved before scores
    existed) pays the full ECTS.
    """
    return sum(
        math.floor(game["ects"] * (100 if score is None else score) / 100 + 0.5)
        for key, score in scores.items()
        if (game := GAMES.get(key)) and game["implemented"]
    )


def year_unlocked(index: int, completed: Collection[str]) -> bool:
    return all(game["id"] in completed for year in YEARS[:index] for game in year["games"])


def can_graduate(completed: Collection[str]) -> bool:
    """Finishing every year graduates you; how well you did decides the ECTS and the career."""
    return all(key in completed and game["implemented"] for key, game in GAMES.items())
