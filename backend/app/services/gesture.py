"""Finger-gun gestures from hand landmarks (docs/SHOOTER_CV.md). Pure Python: no MediaPipe and
no I/O, so every rule is unit-tested with synthetic hands (tests/hands.py).

Landmark indices follow MediaPipe: 0 wrist, 1–4 thumb, 5–8 index, 9–12 middle, 13–16 ring,
17–20 pinky. Image landmarks are normalized to the camera image (not mirrored); world landmarks
are in metres, so pose and trigger don't depend on the hand's distance to the camera.
"""

import math
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

Point = Sequence[float]  # (x, y) or (x, y, z)
Box = tuple[float, float, float, float]  # x0, y0, x1, y1 in mirrored image coordinates
Tracking = Literal["ok", "noPose", "lost"]

INDEX_MCP, INDEX_PIP, INDEX_TIP = 5, 6, 8
THUMB_TIP = 4
WRIST, MIDDLE_MCP = 0, 9
# (MCP, PIP, tip) of the three fingers that must curl for a finger gun.
CURLING_FINGERS = ((9, 10, 12), (13, 14, 16), (17, 18, 20))
LOST_GRACE_MS = 300  # keep the last aim this long after the hand disappears
HISTORY_MS = 500  # how much aim history the look-back can use


@dataclass(frozen=True)
class Hand:
    image: Sequence[Point]  # 21 landmarks, x/y normalized to the camera image
    world: Sequence[Point]  # 21 landmarks in metres


@dataclass(frozen=True)
class GestureConfig:
    """Start values from docs/SHOOTER_CV.md; tune them at the venue."""

    index_straight_degrees: float = 140.0  # MediaPipe's pointing_up.jpg measures 154°
    finger_curled_degrees: float = 120.0
    pose_frames_on: int = 3
    pose_frames_off: int = 5
    trigger_up_m: float = 0.055
    trigger_down_m: float = 0.035
    cooldown_ms: float = 250.0
    lookback_ms: float = 100.0
    box: Box = (0.2, 0.15, 0.8, 0.75)
    min_cutoff: float = 1.2  # One-Euro filter
    beta: float = 0.02
    d_cutoff: float = 1.0


DEFAULT_CONFIG = GestureConfig()


@dataclass(frozen=True)
class GestureFrame:
    tracking: Tracking
    aim: tuple[float, float] | None  # game area 0..1, filtered
    fired_at: tuple[float, float] | None  # set on the frame a shot fires (look-back applied)
    thumb_distance: float | None  # metres, for the debug overlay


def joint_angle(a: Point, b: Point, c: Point) -> float:
    """Angle at `b` in degrees between b→a and b→c: 180 is straight."""
    ba = [a[i] - b[i] for i in range(3)]
    bc = [c[i] - b[i] for i in range(3)]
    length = math.hypot(*ba) * math.hypot(*bc)
    if length == 0:
        return 180.0
    cosine = sum(x * y for x, y in zip(ba, bc, strict=True)) / length
    return math.degrees(math.acos(max(-1.0, min(1.0, cosine))))


def is_finger_gun(world: Sequence[Point], config: GestureConfig = DEFAULT_CONFIG) -> bool:
    """Index straight and at least two of middle, ring and pinky curled."""
    index_angle = joint_angle(world[INDEX_MCP], world[INDEX_PIP], world[INDEX_TIP])
    if index_angle <= config.index_straight_degrees:
        return False
    curled = sum(
        joint_angle(world[mcp], world[pip], world[tip]) < config.finger_curled_degrees
        for mcp, pip, tip in CURLING_FINGERS
    )
    return curled >= 2


def thumb_distance(world: Sequence[Point]) -> float:
    return math.dist(world[THUMB_TIP][:3], world[INDEX_MCP][:3])


def to_game_area(point: Point, box: Box, *, clamp: bool = True) -> tuple[float, float]:
    """Camera image → game area 0..1. The video is shown mirrored, so x is mirrored here too."""
    x0, y0, x1, y1 = box
    x = ((1 - point[0]) - x0) / (x1 - x0)
    y = (point[1] - y0) / (y1 - y0)
    if clamp:
        return (min(1.0, max(0.0, x)), min(1.0, max(0.0, y)))
    return (x, y)


def pick_hand(hands: Sequence[Hand]) -> Hand | None:
    """The hand closest to the camera (largest in the image): someone walking behind the player
    can't steal the crosshair."""
    if not hands:
        return None
    return max(hands, key=lambda hand: math.dist(hand.image[WRIST][:2], hand.image[MIDDLE_MCP][:2]))


class OneEuroFilter:
    """Casiez et al. 2012: smooth when slow, responsive when fast."""

    def __init__(self, min_cutoff: float, beta: float, d_cutoff: float) -> None:
        self.min_cutoff, self.beta, self.d_cutoff = min_cutoff, beta, d_cutoff
        self._value: float | None = None
        self._speed = 0.0
        self._last_ms = 0.0

    def __call__(self, value: float, timestamp_ms: float) -> float:
        if self._value is None:
            self._value, self._last_ms = value, timestamp_ms
            return value
        dt = max((timestamp_ms - self._last_ms) / 1000, 1e-6)
        self._last_ms = timestamp_ms
        speed = (value - self._value) / dt
        self._speed += _alpha(self.d_cutoff, dt) * (speed - self._speed)
        cutoff = self.min_cutoff + self.beta * abs(self._speed)
        self._value += _alpha(cutoff, dt) * (value - self._value)
        return self._value


def _alpha(cutoff: float, dt: float) -> float:
    tau = 1 / (2 * math.pi * cutoff)
    return 1 / (1 + tau / dt)


class GestureTracker:
    """Turns one hand per camera frame into aim, tracking state and shots."""

    def __init__(self, config: GestureConfig = DEFAULT_CONFIG) -> None:
        self.config = config
        self._reset_filters()
        self._pose_valid = False
        self._streak_on = 0
        self._streak_off = 0
        self._armed = False
        self._last_shot_ms: float | None = None
        self._last_seen_ms: float | None = None
        self._last_aim: tuple[float, float] | None = None
        self._history: deque[tuple[float, tuple[float, float]]] = deque()

    def set_box(self, box: Box) -> None:
        self.config = GestureConfig(**{**self.config.__dict__, "box": box})

    def set_cooldown(self, cooldown_ms: float) -> None:
        self.config = GestureConfig(**{**self.config.__dict__, "cooldown_ms": cooldown_ms})

    def update(self, hand: Hand | None, timestamp_ms: float) -> GestureFrame:
        if hand is None:
            return self._lost(timestamp_ms)
        self._last_seen_ms = timestamp_ms
        raw = to_game_area(hand.image[INDEX_TIP], self.config.box)
        aim = (self._filter_x(raw[0], timestamp_ms), self._filter_y(raw[1], timestamp_ms))
        self._remember(timestamp_ms, aim)
        in_pose = is_finger_gun(hand.world, self.config)
        self._update_pose(in_pose)
        distance = thumb_distance(hand.world)
        fired_at = self._trigger(distance, timestamp_ms)
        return GestureFrame(
            tracking="ok" if self._pose_valid else "noPose",
            aim=aim,
            fired_at=fired_at,
            thumb_distance=distance,
        )

    def _update_pose(self, in_pose: bool) -> None:
        if in_pose:
            self._streak_on, self._streak_off = self._streak_on + 1, 0
        else:
            self._streak_on, self._streak_off = 0, self._streak_off + 1
        if not self._pose_valid and self._streak_on >= self.config.pose_frames_on:
            self._pose_valid = True
        elif self._pose_valid and self._streak_off >= self.config.pose_frames_off:
            self._pose_valid = False

    def _trigger(self, distance: float, timestamp_ms: float) -> tuple[float, float] | None:
        """Two thresholds (hysteresis): cocked above `trigger_up_m`, fires on dropping below
        `trigger_down_m`, and must be cocked again before the next shot."""
        if distance > self.config.trigger_up_m:
            self._armed = True
            return None
        if not (self._armed and distance < self.config.trigger_down_m):
            return None
        self._armed = False
        cooled = (
            self._last_shot_ms is None
            or timestamp_ms - self._last_shot_ms >= self.config.cooldown_ms
        )
        if not (self._pose_valid and cooled):
            return None
        self._last_shot_ms = timestamp_ms
        return self._aim_before(timestamp_ms - self.config.lookback_ms)

    def _lost(self, timestamp_ms: float) -> GestureFrame:
        self._pose_valid, self._streak_on, self._armed = False, 0, False
        recently = (
            self._last_seen_ms is not None and timestamp_ms - self._last_seen_ms <= LOST_GRACE_MS
        )
        if not recently:
            self._last_aim = None
            self._history.clear()
            self._reset_filters()
        return GestureFrame(tracking="lost", aim=self._last_aim, fired_at=None, thumb_distance=None)

    def _remember(self, timestamp_ms: float, aim: tuple[float, float]) -> None:
        self._last_aim = aim
        self._history.append((timestamp_ms, aim))
        while self._history and self._history[0][0] < timestamp_ms - HISTORY_MS:
            self._history.popleft()

    def _aim_before(self, timestamp_ms: float) -> tuple[float, float]:
        """The latest aim at or before `timestamp_ms`; the oldest one if the history is shorter."""
        for moment, aim in reversed(self._history):
            if moment <= timestamp_ms:
                return aim
        return self._history[0][1]

    def _reset_filters(self) -> None:
        config = self.config
        self._filter_x = OneEuroFilter(config.min_cutoff, config.beta, config.d_cutoff)
        self._filter_y = OneEuroFilter(config.min_cutoff, config.beta, config.d_cutoff)
