"""The shell's sequential years; legacy run rewards remain in game_config.py."""

import json
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


def earned_ects(completed: set[str]) -> int:
    return sum(
        game["ects"] for key, game in GAMES.items() if key in completed and game["implemented"]
    )


def year_unlocked(index: int, completed: set[str]) -> bool:
    return all(game["id"] in completed for year in YEARS[:index] for game in year["games"])


def can_graduate(completed: set[str]) -> bool:
    return set(GAMES).issubset(completed) and earned_ects(completed) == CONFIG["totalEcts"]
