"""Index recoil from noisy webcam landmarks; real camera play is replayed in test_recoil.py."""

from collections import deque
from dataclasses import dataclass
from typing import Literal

import numpy as np

# Distances use a palm scale that survives the fist turning edge-on. The knuckle span alone
# collapsed from 60 px to 16 px in the recoil playtest, magnifying both motion and noise.
RECOIL_WRIST_SCALE = 0.6
RECOIL_SETTLE_S = 0.12
RECOIL_REST_INDEX_NOISE = 0.90
RECOIL_STILL_INDEX = 0.10
RECOIL_STILL_PALM = 0.35
RECOIL_ANCHOR_PALM_STEP = 0.12
RECOIL_MIN_SPEED = 2.5
RECOIL_START_LIFT = 0.10
RECOIL_MIN_LIFT = 0.28
RECOIL_PIP_FRACTION = 0.25
RECOIL_MIN_RISE_STEP = 0.02
RECOIL_FALL_STEP = 0.05
RECOIL_STRONG_LIFT = 0.85
RECOIL_STRONG_INDEX_UP = 0.65
RECOIL_STRONG_PIP_LIFT = 0.20
RECOIL_STRONG_PALM_LIFT = 0.35
RECOIL_MAX_RISE_S = 0.18
RECOIL_MAX_DURATION_S = 0.35
RECOIL_RECOVERY_TIMEOUT_S = 0.45
RECOIL_AIM_HOLD_S = 0.18
RECOIL_MIN_RETURN = 0.12
RECOIL_RETURN_FRACTION = 0.35
RECOIL_MAX_SIDEWAYS = 0.65
RECOIL_MAX_PALM_TRAVEL = 3.0
RECOIL_MAX_FRAME_GAP_S = 0.12
RECOIL_MAX_INDEX_STEP = 5.0
RECOIL_SWAP_THUMB_DROP = 0.25

RecoilPhase = Literal["settling", "ready", "rising", "recovering"]


@dataclass(frozen=True)
class _Sample:
    t: float
    index: np.ndarray  # index MCP -> tip, in palm scales
    pip: np.ndarray  # index MCP -> PIP, corroborates a real finger lifting
    thumb: np.ndarray  # thumb MCP -> tip, used only to reject landmark swaps
    palm: np.ndarray  # camera pixels
    scale: float


class RecoilTrigger:
    """Settle, then distinguish an index/wrist pitch from translating the whole hand.

    Small flicks need a quick rise and return. A pronounced recoil can confirm on two
    observations of the index tip AND its first joint lifting upright, before occlusion loses
    the hand on the return. Thumb/index swaps move those fingers in opposite directions;
    wrist recoil commonly lifts both, so thumb motion alone must not reject it.
    """

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.phase: RecoilPhase = "settling"
        self.lift = 0.0
        self.shot_time: float | None = None
        self.aim_time: float | None = None
        self._recent: deque[_Sample] = deque()
        self._previous: _Sample | None = None
        self._baseline: _Sample | None = None
        self._peak = 0.0
        self._peak_sideways = 0.0
        self._peak_index = np.zeros(2)
        self._peak_pip_lift = 0.0
        self._rising_frames = 0
        self._rise_ended = False
        self._coherent_frames = 0
        self._rise_start = 0.0
        self._recovery_since = 0.0

    def update(self, pts: np.ndarray, t: float, gun: bool, *, pose_certain: bool = True) -> bool:
        self.shot_time = None
        if not gun or not np.isfinite(pts).all():
            self.reset()
            return False
        knuckles = float(np.linalg.norm(pts[9, :2] - pts[17, :2]))
        wrist = float(np.median(np.linalg.norm(pts[[9, 13, 17], :2] - pts[0, :2], axis=1)))
        scale = max(knuckles, wrist * RECOIL_WRIST_SCALE)
        if scale < 1e-6:
            self.reset()
            return False
        sample = _Sample(
            t,
            (pts[8, :2] - pts[5, :2]) / scale,
            (pts[6, :2] - pts[5, :2]) / scale,
            (pts[4, :2] - pts[2, :2]) / scale,
            pts[[0, 9, 13, 17], :2].mean(axis=0),
            scale,
        )
        previous = self._previous
        if previous is not None:
            dt = t - previous.t
            index_step = float(np.linalg.norm(sample.index - previous.index))
            index_up = float(previous.index[1] - sample.index[1])
            pip_up = float(previous.pip[1] - sample.pip[1])
            thumb_down = float(sample.thumb[1] - previous.thumb[1])
            if (
                dt <= 0
                or dt > RECOIL_MAX_FRAME_GAP_S
                or index_step > RECOIL_MAX_INDEX_STEP
                or (
                    thumb_down > RECOIL_SWAP_THUMB_DROP
                    and index_up > RECOIL_START_LIFT
                    and not (
                        self._coherent_frames >= 1 and pip_up >= index_up * RECOIL_PIP_FRACTION
                    )
                )
            ):
                self.reset()
                previous = None
        self._previous = sample
        if not pose_certain:
            # A brief curled-finger misread may keep an established pose, but its noisy
            # landmarks cannot arm or confirm a shot. Retain the last settled baseline and
            # record the observation for the next frame's motion/timing, without accumulating
            # trigger evidence from the uncertain frame. Continuity checks above still reject
            # label swaps. Hold the last settled aim while the pose is briefly uncertain.
            if self.phase == "ready" and self._baseline is not None:
                self.aim_time = (
                    self._baseline.t if t - self._baseline.t <= RECOIL_MAX_DURATION_S else None
                )
            return False

        baseline = self._baseline
        if baseline is not None and previous is not None:
            offset = baseline.index - sample.index  # image y decreases on an upward flick
            self.lift = float(offset[1])
            palm_travel = float(np.linalg.norm(sample.palm - baseline.palm) / baseline.scale)
            upward = float(previous.index[1] - sample.index[1])
            if self.phase == "recovering":
                self.aim_time = (
                    baseline.t if t - self._recovery_since <= RECOIL_AIM_HOLD_S else None
                )
                if (
                    self.lift > max(RECOIL_STILL_INDEX, self._peak * RECOIL_RETURN_FRACTION)
                    and t - self._recovery_since < RECOIL_RECOVERY_TIMEOUT_S
                ):
                    return False
                self.reset()
                self._previous = sample
            elif self.phase == "ready":
                self.aim_time = None
                if t - baseline.t > RECOIL_MAX_DURATION_S:
                    self.reset()
                    self._previous = sample
                    self._settle(sample, previous)
                    return False
                if upward / (t - previous.t) >= RECOIL_MIN_SPEED and self.lift > RECOIL_START_LIFT:
                    self.phase = "rising"
                    self._rise_start = previous.t
                    self._peak = self.lift
                    self._peak_sideways = abs(float(offset[0]))
                    self._peak_index = sample.index
                    self._peak_pip_lift = float(baseline.pip[1] - sample.pip[1])
                    self._rising_frames = 1
                    self._rise_ended = False
                    self._coherent_frames = 0
                    self.aim_time = baseline.t
                    self._observe_pitch(sample, baseline)
                    return False
            elif self.phase == "rising":
                if (
                    t - self._rise_start > RECOIL_MAX_DURATION_S
                    or palm_travel > RECOIL_MAX_PALM_TRAVEL
                ):
                    self.reset()
                    self._previous = sample
                else:
                    if upward < -RECOIL_FALL_STEP:
                        self._rise_ended = True
                    if upward > RECOIL_MIN_RISE_STEP and not self._rise_ended:
                        self._rising_frames += 1
                    if self.lift > self._peak and self._rise_ended and not self._coherent_frames:
                        # Separate small twitches cannot combine into a larger recoil. Strong
                        # joint-supported pitches may survive one bad index estimate instead.
                        self.reset()
                        self._previous = sample
                        return False
                    if self.lift > self._peak:
                        self._peak = self.lift
                        self._peak_sideways = abs(float(offset[0]))
                        self._peak_index = sample.index
                        self._peak_pip_lift = float(baseline.pip[1] - sample.pip[1])
                        if t - self._rise_start > RECOIL_MAX_RISE_S:
                            self.reset()
                            self._previous = sample
                            return False
                    self._observe_pitch(sample, baseline)
                    directional = self._peak_sideways <= max(
                        RECOIL_STILL_INDEX, self._peak * RECOIL_MAX_SIDEWAYS
                    )
                    upright = (
                        self._peak_index[1] <= -RECOIL_STRONG_INDEX_UP
                        and abs(self._peak_index[0]) <= -self._peak_index[1] * RECOIL_MAX_SIDEWAYS
                    )
                    strong = (
                        self._coherent_frames >= 2
                        and (directional or upright)
                        and t - self._rise_start <= RECOIL_MAX_RISE_S
                        and (baseline.palm[1] - sample.palm[1]) / baseline.scale
                        >= RECOIL_STRONG_PALM_LIFT
                    )
                    returning = self._peak - self.lift >= max(
                        RECOIL_MIN_RETURN, self._peak * RECOIL_RETURN_FRACTION
                    )
                    valid_return = (
                        returning
                        and self._peak >= RECOIL_MIN_LIFT
                        and self._rising_frames >= 2
                        and directional
                        and self._peak_pip_lift >= self._peak * RECOIL_PIP_FRACTION
                    )
                    if strong or valid_return:
                        self.phase = "recovering"
                        self._recovery_since = t
                        self._recent.clear()
                        self.shot_time = baseline.t
                        return True
                    if returning and self._coherent_frames == 0:
                        # A single tip spike must end here rather than accumulate unrelated
                        # later jitter into a shot. One strong joint-supported observation can
                        # survive a bad index reading, as in the second real recoil.
                        self.phase = "ready"
                        self.aim_time = None
                        self._rising_frames = 0
                        self._coherent_frames = 0
                    return False
        self._settle(sample, previous)
        return False

    def _observe_pitch(self, sample: _Sample, baseline: _Sample) -> None:
        if (
            self.lift >= RECOIL_STRONG_LIFT
            and sample.index[1] <= -RECOIL_STRONG_INDEX_UP
            and baseline.pip[1] - sample.pip[1]
            >= max(RECOIL_STRONG_PIP_LIFT, self.lift * RECOIL_PIP_FRACTION)
        ):
            self._coherent_frames += 1

    def _settle(self, sample: _Sample, previous: _Sample | None) -> None:
        self._recent.append(sample)
        while len(self._recent) > 1 and self._recent[1].t <= sample.t - RECOIL_SETTLE_S:
            self._recent.popleft()
        if len(self._recent) < 3 or sample.t - self._recent[0].t < RECOIL_SETTLE_S:
            return
        # A finger pointing at the lens is foreshortened and jitters much more than the palm.
        # Use the window's median rather than requiring every observation to match the last.
        index = np.median([s.index for s in self._recent], axis=0)
        palm = np.median([s.palm for s in self._recent], axis=0)
        still = all(
            abs(s.index[1] - index[1]) <= RECOIL_REST_INDEX_NOISE
            and np.linalg.norm(s.palm - palm) / sample.scale <= RECOIL_STILL_PALM
            for s in self._recent
        )
        if not still:
            return
        # Preserve the pre-motion aim when a wrist starts moving just before the index rises.
        if (
            self._baseline is not None
            and previous is not None
            and np.linalg.norm(sample.palm - previous.palm) / sample.scale > RECOIL_ANCHOR_PALM_STEP
        ):
            return
        self.phase = "ready"
        self._baseline = _Sample(
            sample.t,
            index,
            np.median([s.pip for s in self._recent], axis=0),
            np.median([s.thumb for s in self._recent], axis=0),
            sample.palm,
            float(np.median([s.scale for s in self._recent])),
        )
        self.lift = 0.0
