"""The engine's wire types (/api/cv/stream, /api/cv/status), mirrored by
frontend/level1/input/cvStream.ts. Fields are snake_case here and camelCase on the wire."""

from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from app.schemas import CamelModel

# calibrating: the player's hand is in view, and the engine waits for the finger gun to be held
# still to learn its neutral position (docs/SHOOTER_CV.md → Aim).
Tracking = Literal["ok", "noPose", "lost", "calibrating"]


class CvStatus(CamelModel):
    available: bool
    reason: str | None  # why it isn't available
    active_sessions: int
    max_sessions: int


class CvSlide(CamelModel):
    direction: Literal["left", "right"]
    path: list[tuple[float, float]]
    radius: float  # fraction of game width
    outlines: list[list[tuple[float, float]]] = Field(default_factory=list)


class CvFrame(CamelModel):
    """One processed camera frame, sent over /api/cv/stream. Points are [x, y] in the game
    area (0..1, mirrored like the video); landmarks may lie outside 0..1."""

    type: Literal["frame"] = "frame"
    tracking: Tracking
    aim: tuple[float, float] | None
    fired_at: tuple[float, float] | None  # set on the frame a shot fires
    landmarks: list[tuple[float, float]] | None  # 21 points, for drawing the hand
    thumb_angle: float | None  # degrees from straight up (cocked < 32, fires > 55), for tuning
    slide: CvSlide | None = None
    pinching: bool = False  # held pinch; reopens only above the calibrated open threshold
    processing_ms: float
    slap: Literal["left", "right"] | None = None  # set on the frame a slap is recognised


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


class CvRecordMessage(CamelModel):
    """Start or stop saving the camera frames with the engine's measurements (development only,
    docs/SHOOTER_CV.md → Recording)."""

    type: Literal["record"]
    on: bool = Field(strict=True)


class CvRecenterMessage(CamelModel):
    """Calibrate the aim's neutral position again (the C key)."""

    type: Literal["recenter"]


class CvTriggerMessage(CamelModel):
    """Trigger calibration (docs/SHOOTER_CV.md → Trigger calibration): "up" and "down" collect
    the player's thumb in that position, "done" applies the result, "reset" restores the
    default trigger."""

    type: Literal["trigger"]
    step: Literal["up", "down", "done", "reset"]


class CvTriggerThresholds(CamelModel):
    cocked_below_deg: float
    fired_above_deg: float
    upright_above: float
    folded_below: float
    pinch_open_above: float = 0.65
    pinch_closed_below: float = 0.3


class CvTriggerReply(CamelModel):
    type: Literal["trigger"] = "trigger"
    step: Literal["up", "down", "done", "reset"]
    ok: bool  # False when "done" couldn't tell up from down; the previous trigger stays
    detail: str | None  # why not, for the player
    thresholds: CvTriggerThresholds  # the trigger in use after this step


CvControlMessage = Annotated[
    CvBoxMessage | CvSettingsMessage | CvRecordMessage | CvRecenterMessage | CvTriggerMessage,
    Field(discriminator="type"),
]
