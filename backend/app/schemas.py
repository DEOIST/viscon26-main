"""Every API / domain type lives here. Mirrors frontend/src/misc/CommonInt.ts; change both together.

Convention: `XWHid` ("without id") is the create payload the client sends;
`X(XWHid)` is what the server returns, adding `id` and timestamps.
Fields are snake_case in Python and camelCase in JSON (see `CamelModel`).
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
)
from pydantic.alias_generators import to_camel

from app.game_config import CONFIG


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


class PublicConfig(CamelModel):
    graduation_preview: bool


# --- runs ---

GameId = Literal["blackjack", "shooter"]
EndingId = Literal["quant", "phd", "masters", "mcdonalds", "homeless"]
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
    # Compatibility with older runs; the current character builder never sets this field.
    archetype: ArchetypeId | None = None
    # Preset portrait id such as "a3"; the frontend owns the list of portraits.
    avatar: str = Field(pattern=r"^a[1-8]$")
    hair_color: str = "#70432E"
    skin_color: str = "#E4B48F"
    eye_color: str = "#4B3024"

    @field_validator("hair_color", "skin_color", "eye_color")
    @classmethod
    def preset_color(cls, value: str, info: ValidationInfo) -> str:
        group = {"hair_color": "hair", "skin_color": "skin", "eye_color": "eyes"}[info.field_name]
        if value not in {color["value"] for color in CONFIG["colors"][group]}:
            raise ValueError("Choose a preset color")
        return value


class RunWHid(CamelModel):
    character: Character


class Ending(CamelModel):
    id: EndingId
    title: str


class Run(RunWHid):
    id: str
    created_at: datetime
    scores: dict[GameId, int] = Field(default_factory=dict)  # 0â€“100 per finished minigame
    total_score: int | None = None  # set at graduation
    ending: Ending | None = None  # set at graduation
    graduated_at: datetime | None = None
    completed_game_ids: list[GameId] = Field(default_factory=list)
    ects_points: int = 0


class ScoreSubmission(CamelModel):
    game: GameId
    score: int = Field(ge=0, le=100, strict=True)


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


# --- anonymous shell ---
# Chosen by the player in the character builder; the photo only pre-fills female/male.
CharacterGender = Literal["unspecified", "female", "male", "nonbinary"]
Glasses = Literal["none", "glasses", "sunglasses"]
HairLength = Literal["short", "long"]


class ProfileInput(CamelModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=24)
    hair_color: str
    skin_color: str
    eye_color: str
    gender: CharacterGender = "unspecified"
    glasses: Glasses = "none"
    hair_length: HairLength = "short"
    major: Literal["Computer Science", "D-INFK", "infk"] = "Computer Science"
    onboarding_stage: Literal["acceptance", "main"]

    @field_validator("hair_color", "skin_color", "eye_color")
    @classmethod
    def preset_color(cls, value: str, info: ValidationInfo) -> str:
        group = {"hair_color": "hair", "skin_color": "skin", "eye_color": "eyes"}[info.field_name]
        if value not in {color["value"] for color in CONFIG["colors"][group]}:
            raise ValueError("Choose a preset color")
        return value


class ShellCharacter(CamelModel):
    hair_color: str
    skin_color: str
    eye_color: str
    gender: CharacterGender = "unspecified"
    glasses: Glasses = "none"
    hair_length: HairLength = "short"


class ShellProfile(CamelModel):
    name: str
    character: ShellCharacter
    major: str
    onboarding_stage: Literal["acceptance", "main"]


class ShellProgress(CamelModel):
    completed_game_ids: list[str] = Field(default_factory=list)
    graduated: bool = False
    graduated_at: datetime | None = None
    ects: int = 0


class ShellPlayer(CamelModel):
    id: str
    profile: ShellProfile | None
    progress: ShellProgress


class ScoreboardEntry(CamelModel):
    name: str
    major: str
    ects: int
    graduated: bool


# --- avatar ---

# A webcam still as a data URL. ~2.8 MB of base64 is far more than a 640x480 JPEG needs.
AvatarPhotoUrl = Annotated[
    str, Field(max_length=2_800_000, pattern=r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")
]
# A guess from appearance, offered as a default the player can change; never used as pronouns.
PresentedGender = Literal["male", "female", "unclear"]


class AvatarPhoto(CamelModel):
    model_config = ConfigDict(extra="forbid")
    image: AvatarPhotoUrl


class AvatarSuggestion(CamelModel):
    """Suggested character colors (preset hex values) read from a photo. Skin is measured in the
    browser, not here. Every field is None when the AI is unavailable (source="fallback")."""

    hair_color: str | None = None
    hair_length: HairLength | None = None
    eye_color: str | None = None
    glasses: Glasses | None = None
    gender: PresentedGender | None = None
    source: Literal["ai", "fallback"]
