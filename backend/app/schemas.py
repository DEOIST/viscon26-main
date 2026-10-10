"""Every API / domain type lives here. Mirrors frontend/src/misc/CommonInt.ts; change both together.

The full contract (types and endpoints) is documented in docs/ARCHITECTURE.md → "API contract".

Convention: `XWHid` ("without id") is the create payload the client sends;
`X(XWHid)` is what the server returns, adding `id` and timestamps.
Fields are snake_case in Python and camelCase in JSON (see `CamelModel`).
"""

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for every API schema: `created_at` in Python is `createdAt` on the wire."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class HealthStatus(CamelModel):
    status: str
    environment: str


# --- runs ---

GameId = Literal["blackjack", "shooter"]
EndingId = Literal["c_level", "big_tech", "phd", "mcdonalds", "unemployed"]
Pronouns = Literal["she", "he", "they"]
DepartmentId = Literal[
    "arch", "baug", "biol", "bsse", "chab", "erdw", "gess", "hest",
    "infk", "itet", "math", "matl", "mavt", "mtec", "phys", "usys",
]  # fmt: skip
ArchetypeId = Literal["nerd", "risk_taker", "gamer", "athlete"]

# Letters (accents included), digits, space and . ' _ -. The narrator reads the name aloud.
CharacterName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20, pattern=r"^[\w .'-]+$"),
]


class Character(CamelModel):
    name: CharacterName
    pronouns: Pronouns
    department: DepartmentId
    archetype: ArchetypeId
    # Preset portrait id such as "a3"; the frontend owns the list of portraits.
    avatar: str = Field(pattern=r"^[a-z0-9-]{1,32}$")


class RunWHid(CamelModel):
    character: Character


class Ending(CamelModel):
    id: EndingId
    title: str


class Run(RunWHid):
    id: str
    created_at: datetime
    scores: dict[GameId, int] = Field(default_factory=dict)  # 0–100 per finished minigame
    total_score: int | None = None  # set at graduation
    ending: Ending | None = None  # set at graduation
    graduated_at: datetime | None = None


class ScoreSubmission(CamelModel):
    game: GameId
    score: int = Field(ge=0, le=100)


# --- leaderboard ---


class LeaderboardEntry(CamelModel):
    run_id: str
    name: str
    avatar: str
    department: DepartmentId
    total_score: int
    ending_id: EndingId
    graduated_at: datetime


class EndingStats(CamelModel):
    total: int
    counts: dict[EndingId, int]


# --- story (OpenAI-backed) ---

AiSource = Literal["ai", "fallback"]
DialogueScene = Literal["campus", "blackjack", "shooter"]


class DialogueRequest(CamelModel):
    scene: DialogueScene


class DialoguePack(CamelModel):
    scene: DialogueScene
    lines: dict[str, list[str]]  # event key → lines; keys per scene in docs/GAME_DESIGN.md
    source: AiSource


class Epilogue(CamelModel):
    text: str
    source: AiSource


# --- cv (finger-detection engine) ---

Tracking = Literal["ok", "noPose", "lost"]


class CvStatus(CamelModel):
    available: bool
    reason: str | None  # why it isn't available
    active_sessions: int
    max_sessions: int


class CvFrame(CamelModel):
    """One processed camera frame, sent over /api/cv/stream. Points are [x, y] in the game
    area (0..1, mirrored like the video); landmarks may lie outside 0..1."""

    type: Literal["frame"] = "frame"
    tracking: Tracking
    aim: tuple[float, float] | None
    fired_at: tuple[float, float] | None  # set on the frame a shot fires
    landmarks: list[tuple[float, float]] | None  # 21 points, for drawing the hand
    thumb_distance: float | None  # metres, for the debug overlay
    processing_ms: float


# Client → server control messages on /api/cv/stream. JSON numbers only (no booleans, NaN or
# infinity): strict floats.
CV_MAX_COOLDOWN_MS = 2000
CV_MIN_BOX_SPAN = 0.1  # narrower boxes make aiming twitchy and landmarks blow up
CameraCoordinate = Annotated[float, Field(ge=0, le=1, strict=True, allow_inf_nan=False)]


class CvBoxMessage(CamelModel):
    """Map this region of the mirrored camera image (x0, y0, x1, y1) onto the game area."""

    type: Literal["box"]
    box: tuple[CameraCoordinate, CameraCoordinate, CameraCoordinate, CameraCoordinate]

    @model_validator(mode="after")
    def _has_an_area(self) -> Self:
        x0, y0, x1, y1 = self.box
        if x1 - x0 < CV_MIN_BOX_SPAN or y1 - y0 < CV_MIN_BOX_SPAN:
            raise ValueError(f"x0 < x1 and y0 < y1, at least {CV_MIN_BOX_SPAN} apart")
        return self


class CvSettingsMessage(CamelModel):
    """Per-player trigger settings; the ASVZ-athlete perk shortens the cooldown."""

    type: Literal["settings"]
    cooldown_ms: float = Field(ge=0, le=CV_MAX_COOLDOWN_MS, strict=True, allow_inf_nan=False)


CvControlMessage = Annotated[CvBoxMessage | CvSettingsMessage, Field(discriminator="type")]
