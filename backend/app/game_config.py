"""Shared shell rewards, appearance presets and availability; no client-chosen rewards."""

import json
from pathlib import Path

CONFIG = json.loads((Path(__file__).resolve().parents[2] / "shared/game-config.json").read_text())
GAMES = {game["id"]: game for game in CONFIG["games"]}
if sum(game["ects"] for game in GAMES.values()) != CONFIG["totalEcts"]:
    raise RuntimeError("Configured game rewards must total the degree's ECTS")


def earned_ects(scores: dict[str, int]) -> int:
    return sum(game["ects"] for key, game in GAMES.items() if key in scores and game["implemented"])
