"""Player-facing copy shared with the frontend; IDs and game rules stay in their own config."""

import json
from pathlib import Path

TEXT = json.loads(
    (Path(__file__).resolve().parents[2] / "shared/text.json").read_text(encoding="utf-8")
)
