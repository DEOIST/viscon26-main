"""A short index-finger recoil pulse, measured relative to the hand rather than the screen."""

from collections import deque
from dataclasses import dataclass
from typing import Literal

import numpy as np

# Distances are in palm widths (middle-to-pinky knuckles), speeds in palm widths / second.
# These are starting values for playtesting; camera recordings so far contain thumb drops.
RECOIL_SETTLE_S = 0.12
RECOIL_STILL_INDEX = 0.10
RECOIL_STILL_PALM = 0.18
RECOIL_MIN_SPEED = 2.5
RECOIL_MIN_LIFT = 0.35
RECOIL_MIN_RISE_STEP = 0.02
RECOIL_MAX_RISE_S = 0.18
RECOIL_MAX_DURATION_S = 0.35
RECOIL_RECOVERY_TIMEOUT_S = 0.45
RECOIL_MIN_RETURN = 0.12
RECOIL_RETURN_FRACTION = 0.35
RECOIL_MAX_SIDEWAYS = 0.65  # sideways travel / upward lift
RECOIL_MAX_PALM_TRAVEL = 0.60
RECOIL_MAX_FRAME_GAP_S = 0.12
RECOIL_MAX_INDEX_STEP = 1.2
RECOIL_MAX_THUMB_STEP = 0.65

RecoilPhase = Literal["settling", "ready", "rising", "recovering"]


@dataclass(frozen=True)
class _Sample:
    t: float
    index: np.ndarray  # index MCP -> tip, in palm widths
    thumb: np.ndarray  # thumb MCP -> tip, used only to reject landmark swaps
    palm: np.ndarray  # camera pixels
    scale: float


class RecoilTrigger:
    """Settle -> quick upward rise -> return -> settle. A new aim held up never fires.

    Two rising observations and a return reject isolated landmark spikes. The thumb's position
    never arms or fires the gun. Its continuity distinguishes a real index lifting upright from
    MediaPipe exchanging the two fingers (the static upright-index heuristic cannot do that).
    """

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.phase: RecoilPhase = "settling"
        self.lift = 0.0
        self.shot_time: float | None = None
        self._recent: deque[_Sample] = deque()
        self._previous: _Sample | None = None
        self._baseline: _Sample | None = None
        self._peak = 0.0
        self._rising_frames = 0
        self._fast = False
        self._recovery_since = 0.0

    def update(self, pts: np.ndarray, t: float, gun: bool) -> bool:
        self.shot_time = None
        scale = float(np.linalg.norm(pts[9, :2] - pts[17, :2]))
        if not gun or not np.isfinite(pts).all() or scale < 1e-6:
            self.reset()
            return False
        sample = _Sample(
            t,
            (pts[8, :2] - pts[5, :2]) / scale,
            (pts[4, :2] - pts[2, :2]) / scale,
            pts[[0, 9, 13, 17], :2].mean(axis=0),
            scale,
        )
        previous = self._previous
        if previous is not None:
            dt = t - previous.t
            index_step = float(np.linalg.norm(sample.index - previous.index))
            thumb_step = float(np.linalg.norm(sample.thumb - previous.thumb))
            if (
                dt <= 0
                or dt > RECOIL_MAX_FRAME_GAP_S
                or index_step > RECOIL_MAX_INDEX_STEP
                or (thumb_step > RECOIL_MAX_THUMB_STEP and index_step > RECOIL_STILL_INDEX)
            ):
                self.reset()
                previous = None
        self._previous = sample

        baseline = self._baseline
        if baseline is not None:
            offset = baseline.index - sample.index  # image y decreases on an upward flick
            self.lift = float(offset[1])
            palm_travel = float(np.linalg.norm(sample.palm - baseline.palm) / baseline.scale)
            if self.phase == "recovering":
                # Staying raised, or oscillating around the top, cannot re-arm another shot.
                if (
                    np.linalg.norm(offset) > RECOIL_STILL_INDEX
                    and t - self._recovery_since < RECOIL_RECOVERY_TIMEOUT_S
                ):
                    return False
                # A player may re-aim before returning all the way. After a bounded recovery,
                # a fresh settle at that position can arm again instead of locking the trigger.
                self.reset()
                self._previous = sample
            elif self.phase == "rising":
                if (
                    t - baseline.t > RECOIL_MAX_DURATION_S
                    or palm_travel > RECOIL_MAX_PALM_TRAVEL
                    or abs(offset[0]) > max(RECOIL_STILL_INDEX, self._peak * RECOIL_MAX_SIDEWAYS)
                    or self.lift < -RECOIL_STILL_INDEX
                ):
                    self.reset()
                    self._previous = sample
                else:
                    upward = float(previous.index[1] - sample.index[1]) if previous else 0.0
                    if upward > RECOIL_MIN_RISE_STEP:
                        self._rising_frames += 1
                        self._fast |= upward / (t - previous.t) >= RECOIL_MIN_SPEED
                    if self.lift > self._peak:
                        self._peak = self.lift
                        if t - baseline.t > RECOIL_MAX_RISE_S:
                            self.reset()
                            self._previous = sample
                            return False
                    returning = self._peak - self.lift >= max(
                        RECOIL_MIN_RETURN, self._peak * RECOIL_RETURN_FRACTION
                    )
                    if returning:
                        valid = (
                            self._fast
                            and self._peak >= RECOIL_MIN_LIFT
                            and self._rising_frames >= 2
                        )
                        self.phase = "recovering"
                        self._recovery_since = t
                        self._recent.clear()
                        if valid:
                            self.shot_time = baseline.t
                        return valid
                    return False
            elif self.phase == "ready":
                upward = float(previous.index[1] - sample.index[1]) if previous else 0.0
                if (
                    previous is not None
                    and upward / (t - previous.t) >= RECOIL_MIN_SPEED
                    and self.lift > RECOIL_STILL_INDEX
                    and abs(offset[0]) <= self.lift * RECOIL_MAX_SIDEWAYS
                    and palm_travel <= RECOIL_MAX_PALM_TRAVEL
                ):
                    self.phase = "rising"
                    self._peak = self.lift
                    self._rising_frames = 1
                    self._fast = True
                    return False
                if np.linalg.norm(offset) > RECOIL_STILL_INDEX or palm_travel > RECOIL_STILL_PALM:
                    self.reset()
                    self._previous = sample

        self._recent.append(sample)
        # Retain the observation just before the settle window, including at lower camera fps.
        while len(self._recent) > 1 and self._recent[1].t <= t - RECOIL_SETTLE_S:
            self._recent.popleft()
        if len(self._recent) >= 3 and t - self._recent[0].t >= RECOIL_SETTLE_S:
            still = all(
                np.linalg.norm(item.index - sample.index) <= RECOIL_STILL_INDEX
                and np.linalg.norm(item.palm - sample.palm) / sample.scale <= RECOIL_STILL_PALM
                for item in self._recent
            )
            if still:
                self.phase = "ready"
                self._baseline = sample
                self.lift = 0.0
        return False
