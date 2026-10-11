"""Finger-gun gestures from hand landmarks (docs/SHOOTER_CV.md). No MediaPipe and no I/O, so every
rule is unit-tested with synthetic hands (tests/hands.py) and replayed webcam recordings
(tests/fixtures/captures/).

Landmark indices follow MediaPipe: 0 wrist, 1–4 thumb, 5–8 index, 9–12 middle, 13–16 ring,
17–20 pinky. Geometry uses the image landmarks scaled to pixels (x*W, y*H, z*W). MediaPipe's
metric "world" landmarks are unreliable when the index finger points straight at the camera, so
they are not used.

With the index pointing at the camera, MediaPipe often swaps the thumb and the index finger: the
upright thumb is labeled as the index, and the thumb chain is laid along the curled fingers. On
our recordings that happened in ~15 % of the frames and fired most false shots, and it threw the
aim around, which then used the index tip. So the trigger recognizes the swap (labels_swapped),
and the aim uses only landmarks that are never swapped (the wrist and the curled fingers).
"""

import math
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np

Point = Sequence[float]  # (x, y, z): x, y normalized to the camera image (not mirrored)
Hand = Sequence[Point]  # MediaPipe's 21 image landmarks of one hand
Box = tuple[float, float, float, float]  # x0, y0, x1, y1 in mirrored image coordinates
Tracking = Literal["ok", "noPose", "lost", "calibrating"]

WRIST, THUMB_MCP, THUMB_TIP = 0, 2, 4
INDEX_MCP, INDEX_PIP, INDEX_TIP = 5, 6, 8
RING_PIP, RING_TIP = 14, 16
PINKY_PIP, PINKY_TIP = 18, 20
# The aim's reference point: the wrist and the knuckles of the curled fingers, the landmarks
# that never swap. Steady (frame-to-frame jitter ~2 % of a player's aiming range on our
# recordings) and it swings with the fist when the player points.
PALM = [0, 9, 13, 17]

# The hammer falls two ways, and the trigger watches both:
# - sideways: the thumb tilts away from straight up. Its angle (or, when the labels are swapped,
#   that of the upright digit MediaPipe calls the index) passes FIRED_ABOVE_DEG.
# - forward, toward the camera: the thumb folds over the fist and looks short, while its angle
#   only reaches 30–54 deg. Its image length falls below THUMB_FOLDED_BELOW of its upright length.
# The upright length is learned while the thumb points up (fast when it grows, slowly when it
# shrinks), relative to the middle-to-pinky knuckle span, so it adapts to each player's hand and
# distance. The gun is cocked when the thumb points up (angle below COCKED_BELOW_DEG) and is
# long again (above THUMB_UPRIGHT_ABOVE); a shot needs the hammer down for FIRE_CONFIRM_FRAMES
# frames in a row, then a re-cock. On our recordings of play (tests/fixtures/captures/, 63
# drops labeled by eye, both kinds) this caught every drop with no false shot; the angle alone
# missed 21 forward drops, and 40 deg instead of 55 fired on hands that only rolled.
COCKED_BELOW_DEG = 32.0
FIRED_ABOVE_DEG = 55.0
THUMB_UPRIGHT_ABOVE = 0.8
THUMB_FOLDED_BELOW = 0.7
THUMB_LENGTH_GROW = 0.5  # per frame, toward a longer upright thumb
THUMB_LENGTH_SHRINK = 0.02  # per frame, toward a shorter one (~1.5 s): a fold barely moves it
FIRE_CONFIRM_FRAMES = 2  # +1 frame (~33 ms) of latency; removes one-frame flickers


# Pinch defaults and calibration tunables, in index-to-pinky knuckle widths.
PINCH_OPEN_ABOVE = 0.65
PINCH_CLOSED_BELOW = 0.3
PINCH_MIN_GAP = 0.15
PINCH_SETTLING_FRAMES = 10


@dataclass(frozen=True)
class TriggerThresholds:
    """When the hammer counts as cocked and as fallen. The defaults above fit most hands; a
    player whose thumb barely moves (or rests tilted) gets their own from TriggerCalibration."""

    cocked_below_deg: float = COCKED_BELOW_DEG
    fired_above_deg: float = FIRED_ABOVE_DEG
    upright_above: float = THUMB_UPRIGHT_ABOVE
    folded_below: float = THUMB_FOLDED_BELOW
    pinch_open_above: float = PINCH_OPEN_ABOVE
    pinch_closed_below: float = PINCH_CLOSED_BELOW


DEFAULT_TRIGGER = TriggerThresholds()

# Trigger calibration (docs/SHOOTER_CV.md → Trigger calibration): the game asks the player to
# hold the thumb up, then down, and the thresholds go between the two. A position needs this many
# finger-gun frames (~0.3 s); the two positions must differ by this much to be told apart.
TRIGGER_MIN_SAMPLES = 10
TRIGGER_MIN_ANGLE_GAP = 12.0  # degrees
TRIGGER_MIN_LENGTH_GAP = 0.12  # fraction of the upright thumb length

# A swap shows as an "index" that points straight up in the image and is extended; a real index
# points at the camera and is foreshortened (reach ~1.0). On the recordings swapped frames read
# 0–15 deg and reach 1.2–1.4.
SWAP_INDEX_DEG = 35.0
SWAP_INDEX_REACH = 1.15

# The thumb drop drags the aim in the frames before a shot registers, so a shot reports where
# the gun pointed this long ago.
SHOT_AIM_LOOKBACK_S = 0.2

# Aim: the palm point's offset from the player's neutral position, mirrored and scaled. Moving
# the hand over 1/AIM_GAIN of the camera width sweeps the whole screen; vertical moves are scaled
# by the game area's aspect ratio (16:9, games/shared/gameSize.ts) so both axes feel the same.
AIM_GAIN = 4.0
GAME_ASPECT = 16 / 9
# The neutral position is calibrated at the start of a stream, and again on request (the C key):
# the first CALIBRATION_FRAMES frames (0.5 s) in which the player holds the finger gun this still
# (frame widths). The warm-up's first target sits in the centre of the screen, so that is where
# players hold it.
CALIBRATION_FRAMES = 15
CALIBRATION_STILL = 0.02

# One Euro smoothing of the aim. On the live recordings this cuts frame-to-frame wobble by ~60%
# versus (1.5 Hz, 1.0) for about one extra frame (~33 ms) of lag.
AIM_MIN_CUTOFF_HZ = 0.5  # lower = steadier when holding still
AIM_BETA = 0.5  # higher = less lag on fast moves, but more abrupt

# Telling hands apart between frames: a hand is the same one if its palm moved less than this
# (fraction of the frame width) since it was last seen; a hand unseen for longer than the timeout
# is gone, and one appearing later gets a new id. Within the timeout it keeps its cocked thumb,
# and the crosshair keeps its last aim.
TRACK_MAX_JUMP = 0.2
TRACK_TIMEOUT_S = 0.3

# With more than one hand allowed, MediaPipe sometimes reports one hand twice (its tracked hand
# plus a fresh detection of it). Two detections are the same hand when this much of the smaller
# one's bounding box lies inside the other's.
DUPLICATE_OVERLAP = 0.5

# Slap: a huge, fast move of the player's palm (docs/SHOOTER_CV.md → Slap). Aiming needs at most
# about 1/AIM_GAIN of the frame width, so moving SLAP_MIN_DISTANCE frame widths within
# SLAP_WINDOW_S is never an aim. A slap often blurs the hand out of view: vanishing while moving
# at least SLAP_MIN_SPEED counts too. Shots are ignored for SLAP_SHOT_BLOCK_S after a slap, since a
# blurred thumb can read as dropped. Untuned: record real slaps (R) and adjust.
SLAP_WINDOW_S = 0.25
SLAP_MIN_DISTANCE = 0.35  # frame widths
SLAP_MIN_SPEED = 1.5  # frame widths per second, between the last two frames before vanishing
SLAP_COOLDOWN_S = 0.6  # one slap per swing
SLAP_SHOT_BLOCK_S = 0.3
# A very fast slap blurs the hand away before any frame shows it moving. Two signals that don't
# need the hand: the share of pixels that changed sharply around where the hand was last seen
# (CvSession measures it, `motion`), and the hand coming back far from where it vanished.
SLAP_MIN_MOTION = 0.25  # share of the area around the last hand that changed sharply
SLAP_REAPPEAR_S = 0.6
SLAP_REAPPEAR_DISTANCE = 0.3  # frame widths
# A deliberate open-hand slide can be much slower than a slap. Require lateral travel,
# mostly one direction, and open fingers to distinguish it from carrying a pinched bug.
# Playtests asked for more sensitive swipes: these were 0.18 s, 0.18 widths, 0.45 widths/s and 0.7.
SLIDE_WINDOW_S = 0.9
SLIDE_MIN_DURATION_S = 0.12
SLIDE_MIN_DISTANCE = 0.12  # camera widths
SLIDE_MIN_SPEED = 0.3  # camera widths per second: hovering is not a swipe
SLAP_RAW_MIN_SPEED = 0.9
SLIDE_MIN_DIRECTNESS = 0.6  # net travel / total travel
# Slides keep their own cooldown: sharing the slap's let a slow wind-up swallow the slap after it.
SLIDE_COOLDOWN_S = 0.6
Slap = Literal["left", "right"]  # on screen (the camera image is mirrored)


@dataclass(frozen=True)
class Motion:
    """How much changed around the player's last known hand since the previous frame."""

    share: float  # 0..1 of that area changed sharply
    dx: float  # direction of moving image changes
    speed: float = 0.0  # camera widths per second, measured across changed-image regions


# Minimum time between two shots of the player. The ASVZ-athlete perk lowers it per stream
# ({"type": "settings"}); re-cocking the thumb is still required for every shot.
DEFAULT_COOLDOWN_MS = 250.0

UP = np.array([0.0, -1.0, 0.0])


def to_points(hand: Hand, width: int, height: int) -> np.ndarray:
    """Normalized landmarks -> (21, 3) array in pixel units (x, y, z all to scale)."""
    return np.array([(p[0] * width, p[1] * height, p[2] * width) for p in hand])


def _unit(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm > 0 else np.zeros_like(v)


def _degrees_from_up(v: np.ndarray) -> float:
    cos = _unit(v) @ UP[: len(v)]
    return math.degrees(math.acos(np.clip(cos, -1.0, 1.0)))


def thumb_angle(pts: np.ndarray) -> float:
    """Degrees between the thumb and straight up: small when cocked, large once it drops."""
    return _degrees_from_up(pts[THUMB_TIP] - pts[THUMB_MCP])


def _reach(pts: np.ndarray, pip: int, tip: int) -> float:
    """Above 1 when the finger is extended (its tip is further from the wrist than its PIP)."""
    return float(np.linalg.norm(pts[tip] - pts[WRIST]) / np.linalg.norm(pts[pip] - pts[WRIST]))


def labels_swapped(pts: np.ndarray) -> bool:
    """MediaPipe called the upright thumb the index finger (see the module docstring)."""
    index_up = _degrees_from_up(pts[INDEX_TIP][:2] - pts[INDEX_MCP][:2])
    return index_up < SWAP_INDEX_DEG and _reach(pts, INDEX_PIP, INDEX_TIP) > SWAP_INDEX_REACH


def hammer_angle(pts: np.ndarray) -> float:
    """The thumb's angle from straight up, read from whichever chain really is the thumb."""
    if labels_swapped(pts):
        return _degrees_from_up(pts[INDEX_TIP][:2] - pts[INDEX_MCP][:2])
    return thumb_angle(pts)


def thumb_length(pts: np.ndarray) -> float | None:
    """The thumb's image length in knuckle spans (middle to pinky MCP); None when the labels
    are swapped (that chain is not the thumb) or the hand is degenerate."""
    span = float(np.linalg.norm(pts[9][:2] - pts[17][:2]))
    if labels_swapped(pts) or span == 0:
        return None
    return float(np.linalg.norm(pts[THUMB_TIP][:2] - pts[THUMB_MCP][:2])) / span


def is_gun(pts: np.ndarray) -> bool:
    """Ring and pinky curled. The index is not checked: pointing at the camera foreshortens it
    to a reach of ~1.05, the same as a curled finger, which blocked real shots. The middle finger
    is too ambiguous to use (0.76-1.17 on the samples)."""
    return _reach(pts, RING_PIP, RING_TIP) < 1.0 and _reach(pts, PINKY_PIP, PINKY_TIP) < 1.0


def palm_point(pts: np.ndarray, width: int) -> tuple[float, float]:
    """The aim's reference point in frame widths on both axes (so distances are isotropic)."""
    x, y = pts[PALM, :2].mean(axis=0) / width
    return float(x), float(y)


def to_game_area(point: Point, box: Box) -> tuple[float, float]:
    """Camera image → game area through the calibration box, mirrored like the video, unclamped.
    Used to draw the hand skeleton on top of the video, which the browser scales the same way."""
    x0, y0, x1, y1 = box
    return (((1 - point[0]) - x0) / (x1 - x0), (point[1] - y0) / (y1 - y0))


def _alpha(cutoff: float, dt: float) -> float:
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class OneEuroFilter:
    """One Euro filter (Casiez et al. 2012): heavy smoothing when still, little lag when moving."""

    def __init__(self, min_cutoff: float, beta: float, d_cutoff: float = 1.0) -> None:
        self.min_cutoff, self.beta, self.d_cutoff = min_cutoff, beta, d_cutoff
        self._x: float | None = None
        self._dx = 0.0
        self._t = 0.0

    def __call__(self, x: float, t: float) -> float:
        if self._x is None:
            self._x, self._dx, self._t = x, 0.0, t
            return x
        dt = max(t - self._t, 1e-6)
        self._dx += _alpha(self.d_cutoff, dt) * ((x - self._x) / dt - self._dx)
        self._x += _alpha(self.min_cutoff + self.beta * abs(self._dx), dt) * (x - self._x)
        self._t = t
        return self._x


@dataclass(frozen=True)
class GunReading:
    """One hand on one frame: its trigger and the measurements behind it (for recordings)."""

    shot: bool  # the hammer fell on this frame, in finger-gun pose
    gun: bool  # in finger-gun pose (ring and pinky curled)
    hammer_angle: float  # degrees from straight up, swap-corrected: what the trigger uses
    thumb_angle: float  # degrees from straight up, as labeled by MediaPipe
    thumb_length: float | None  # fraction of its learned upright length; None when swapped
    swapped: bool  # MediaPipe swapped the thumb and index labels
    cocked: bool  # after this frame
    palm: tuple[float, float]  # the aim's reference point, frame widths, camera view
    reach: tuple[float, float, float]  # index, ring, pinky: above 1 means extended
    pinching: bool = False
    pinch_distance: float | None = None  # fingertip gap in palm widths


class GunTracker:
    """One hand's trigger. Feed frames in order, one at a time."""

    def __init__(self) -> None:
        self._cocked = False
        self._down_frames = 0  # consecutive frames with the hammer down while cocked
        self._upright_length: float | None = None  # learned thumb length, in knuckle spans

    def update(
        self, hand: Hand, width: int, height: int, trigger: TriggerThresholds = DEFAULT_TRIGGER
    ) -> GunReading:
        pts = to_points(hand, width, height)
        swapped = labels_swapped(pts)
        angle = hammer_angle(pts)
        gun = is_gun(pts)
        length = self._relative_length(thumb_length(pts), angle, trigger.cocked_below_deg)

        shot = False
        upright = angle < trigger.cocked_below_deg and (
            length is None or length > trigger.upright_above
        )
        fallen = angle > trigger.fired_above_deg or (
            length is not None and length < trigger.folded_below
        )
        if upright:
            self._cocked, self._down_frames = True, 0
        elif fallen and self._cocked:
            self._down_frames += 1
            if self._down_frames >= FIRE_CONFIRM_FRAMES:
                self._cocked, self._down_frames = False, 0
                shot = gun
        else:
            self._down_frames = 0

        palm = palm_point(pts, width)
        return GunReading(
            shot=shot,
            gun=gun,
            hammer_angle=round(angle, 1),
            thumb_angle=round(thumb_angle(pts), 1),
            thumb_length=None if length is None else round(length, 2),
            swapped=swapped,
            cocked=self._cocked,
            palm=(round(palm[0], 4), round(palm[1], 4)),
            reach=(
                round(_reach(pts, INDEX_PIP, INDEX_TIP), 2),
                round(_reach(pts, RING_PIP, RING_TIP), 2),
                round(_reach(pts, PINKY_PIP, PINKY_TIP), 2),
            ),
        )

    def _relative_length(
        self, length: float | None, angle: float, cocked_below_deg: float
    ) -> float | None:
        """Learns the upright thumb length while the thumb points up, and returns this frame's
        length as a fraction of it (None before anything is learned, or when swapped)."""
        if length is None:
            return None
        if angle < cocked_below_deg:
            if self._upright_length is None:
                self._upright_length = length
            else:
                rate = THUMB_LENGTH_GROW if length > self._upright_length else THUMB_LENGTH_SHRINK
                self._upright_length += rate * (length - self._upright_length)
        if not self._upright_length:
            return None
        return length / self._upright_length


TriggerPosition = Literal["up", "down"]


class TriggerCalibration:
    """Learns one player's trigger from their own thumb: the game asks for the thumb up, then
    down (a shot held), and feeds the finger-gun readings of each position here. The thresholds
    go between the two, so a small drop, or a thumb that rests tilted, still fires and re-cocks.
    """

    def __init__(self) -> None:
        self.position: TriggerPosition | None = None
        self._readings: dict[TriggerPosition, list[GunReading]] = {"up": [], "down": []}

    def add(self, reading: GunReading) -> None:
        if self.position is not None and reading.gun:
            self._readings[self.position].append(reading)

    def result(self) -> tuple[TriggerThresholds | None, str | None]:
        """(thresholds, None), or (None, why it couldn't tell up from down)."""
        up, down = self._readings["up"], self._readings["down"]
        if min(len(up), len(down)) < TRIGGER_MIN_SAMPLES:
            return None, "Keep your finger gun in view of the camera, thumb up and then down"
        # The highest a held-up thumb leans, against where a dropped thumb typically sits
        angle_up = float(np.percentile([r.hammer_angle for r in up], 80))
        angle_down = float(np.median([r.hammer_angle for r in down]))
        lengths_up = [r.thumb_length for r in up if r.thumb_length is not None]
        lengths_down = [r.thumb_length for r in down if r.thumb_length is not None]
        length_up = length_down = None
        if min(len(lengths_up), len(lengths_down)) >= TRIGGER_MIN_SAMPLES:
            length_up = float(np.median(lengths_up))
            length_down = float(np.median(lengths_down))

        tilts = angle_down - angle_up >= TRIGGER_MIN_ANGLE_GAP
        folds = (
            length_up is not None
            and length_down is not None
            and length_up - length_down >= TRIGGER_MIN_LENGTH_GAP
        )
        if not tilts and not folds:
            return None, "Your thumb looked the same up and down: drop it further to shoot"

        if tilts:
            gap = angle_down - angle_up
            cocked = min(max(angle_up + 0.3 * gap, 10.0), 60.0)
            fired = min(max(angle_up + 0.6 * gap, cocked + 6.0), 90.0)
        else:
            # The drop is a fold toward the camera: keep the tilt trigger out of the way, but
            # make sure this player's resting thumb still counts as cocked
            cocked = max(COCKED_BELOW_DEG, min(angle_up + 5.0, 60.0))
            fired = max(FIRED_ABOVE_DEG, cocked + 10.0)
        upright, folded = THUMB_UPRIGHT_ABOVE, THUMB_FOLDED_BELOW
        if folds:
            assert length_up is not None and length_down is not None
            span = length_up - length_down
            folded = min(max(length_down + 0.5 * span, 0.3), 0.9)
            upright = min(max(length_down + 0.8 * span, folded + 0.05), 1.0)
        elif length_up is not None:
            upright = min(THUMB_UPRIGHT_ABOVE, length_up - 0.05)
        return TriggerThresholds(
            cocked_below_deg=round(cocked, 1),
            fired_above_deg=round(fired, 1),
            upright_above=round(upright, 2),
            folded_below=round(folded, 2),
        ), None


class PinchTracker:
    """An open hand arms one pinch. Holding the pinch cannot produce repeated grabs."""

    def __init__(self) -> None:
        self._armed = False
        self._closed_frames = 0
        self._pinching = False

    def reset(self) -> None:
        self._armed = False
        self._closed_frames = 0
        self._pinching = False

    def update(
        self, hand: Hand, width: int, height: int, trigger: TriggerThresholds = DEFAULT_TRIGGER
    ) -> GunReading:
        pts = to_points(hand, width, height)
        span = float(np.linalg.norm(pts[INDEX_MCP, :2] - pts[17, :2]))
        gap = float(np.linalg.norm(pts[THUMB_TIP, :2] - pts[INDEX_TIP, :2]))
        distance = gap / span if span > 1.0 else None
        shot = False
        if distance is None:
            self.reset()
        elif distance > trigger.pinch_open_above:
            self._pinching = False
            self._armed = True
            self._closed_frames = 0
        elif distance < trigger.pinch_closed_below and self._armed:
            self._closed_frames += 1
            if self._closed_frames >= FIRE_CONFIRM_FRAMES:
                shot = True
                self.reset()
                self._pinching = True
        else:
            self._closed_frames = 0
        return GunReading(
            shot=shot,
            gun=distance is not None,
            hammer_angle=round(thumb_angle(pts), 1),
            thumb_angle=round(thumb_angle(pts), 1),
            thumb_length=None,
            swapped=False,
            cocked=self._armed,
            palm=palm_point(pts, width),
            reach=(0.0, 0.0, 0.0),
            pinching=self._pinching,
            pinch_distance=distance,
        )


class PinchCalibration:
    """Use palm-normalized distances so moving closer does not change the trigger."""

    def __init__(self) -> None:
        # Keep the existing wire steps: up means open, down means pinched.
        self.position: TriggerPosition | None = None
        self._readings: dict[TriggerPosition, list[float]] = {"up": [], "down": []}
        self._settling_frames = 0

    def start(self, position: TriggerPosition) -> None:
        self.position = position
        # Ignore the reaction and movement at the start of each instruction.
        self._settling_frames = PINCH_SETTLING_FRAMES

    def add(self, reading: GunReading) -> None:
        if self.position is None or reading.pinch_distance is None:
            return
        if self._settling_frames > 0:
            self._settling_frames -= 1
            return
        self._readings[self.position].append(reading.pinch_distance)

    def result(self) -> tuple[TriggerThresholds | None, str | None]:
        opened, closed = self._readings["up"], self._readings["down"]
        if min(len(opened), len(closed)) < TRIGGER_MIN_SAMPLES:
            return None, "Keep your palm facing the camera with both fingertips visible"
        open_gap = float(np.percentile(opened, 20))
        closed_gap = float(np.percentile(closed, 80))
        gap = open_gap - closed_gap
        if gap < PINCH_MIN_GAP:
            return None, "Separate your index finger and thumb more, then touch their tips together"
        return TriggerThresholds(
            pinch_open_above=round(closed_gap + 0.7 * gap, 3),
            pinch_closed_below=round(closed_gap + 0.3 * gap, 3),
        ), None


def _box(hand: Hand) -> tuple[np.ndarray, np.ndarray]:
    xy = np.array([(p[0], p[1]) for p in hand])
    return xy.min(axis=0), xy.max(axis=0)


def _area(box: tuple[np.ndarray, np.ndarray]) -> float:
    return float(np.prod(box[1] - box[0]))


def drop_duplicate_hands(hands: Sequence[Hand]) -> tuple[list[Hand], list[Hand]]:
    """Splits MediaPipe detections into (distinct hands, duplicates of them), each largest first.

    Larger detections are kept first: a duplicate often covers only part of the hand."""
    kept: list[Hand] = []
    duplicates: list[Hand] = []
    for hand in sorted(hands, key=lambda hand: _area(_box(hand)), reverse=True):
        box = _box(hand)
        for other in kept:
            other_box = _box(other)
            corner_low = np.maximum(box[0], other_box[0])
            corner_high = np.minimum(box[1], other_box[1])
            overlap = float(np.prod(np.clip(corner_high - corner_low, 0, None)))
            if overlap > DUPLICATE_OVERLAP * min(_area(box), _area(other_box)):
                duplicates.append(hand)
                break
        else:
            kept.append(hand)
    return kept, duplicates


class _Track:
    def __init__(self, track_id: int, pinch: bool = False) -> None:
        self.id = track_id
        self.gun = PinchTracker() if pinch else GunTracker()
        self.palm = np.zeros(2)  # in frame widths
        self.last_seen = 0.0


class GunTracks:
    """All hands in the camera view, each with its own GunTracker and a stable id.

    Each frame, hands are matched to the tracks of the previous frames by nearest palm position
    (closest pairs first), so ids survive hands moving and MediaPipe reordering them.
    """

    def __init__(self) -> None:
        self.pinch = False
        self._tracks: list[_Track] = []
        self._next_id = 1
        self.ids: list[int] = []  # track id of each hand in the last update, in the same order

    def reset_pinches(self) -> None:
        for track in self._tracks:
            if isinstance(track.gun, PinchTracker):
                track.gun.reset()

    def update(
        self,
        hands: Sequence[Hand],
        width: int,
        height: int,
        t: float,
        trigger: TriggerThresholds = DEFAULT_TRIGGER,
    ) -> list[GunReading]:
        """hands: landmarks of every visible hand. Returns one reading per hand, in the same order
        (and their track ids in `ids`)."""
        self._tracks = [tr for tr in self._tracks if t - tr.last_seen <= TRACK_TIMEOUT_S]
        palms = [np.array(palm_point(to_points(hand, width, height), width)) for hand in hands]

        pairs = sorted(
            (float(np.linalg.norm(palm - track.palm)), h, k)
            for h, palm in enumerate(palms)
            for k, track in enumerate(self._tracks)
        )
        matched: dict[int, _Track] = {}
        taken: set[int] = set()
        for distance, h, k in pairs:
            if distance <= TRACK_MAX_JUMP and h not in matched and k not in taken:
                matched[h] = self._tracks[k]
                taken.add(k)

        readings, self.ids = [], []
        for h, hand in enumerate(hands):
            track = matched.get(h)
            if track is None:
                track = _Track(self._next_id, self.pinch)
                self._next_id += 1
                self._tracks.append(track)
            track.palm, track.last_seen = palms[h], t
            readings.append(track.gun.update(hand, width, height, trigger))
            self.ids.append(track.id)
        return readings


@dataclass(frozen=True)
class TrackedHand:
    id: int  # stays with the hand across frames (GunTracks)
    landmarks: Hand
    reading: GunReading


@dataclass(frozen=True)
class Slide:
    direction: Slap
    path: list[tuple[float, float]]  # mirrored game coordinates
    radius: float  # small contact tolerance, fraction of game width
    outlines: list[list[tuple[float, float]]]  # all 21 points on each swept frame


@dataclass(frozen=True)
class GestureFrame:
    tracking: Tracking
    aim: tuple[float, float] | None  # game area 0..1, filtered
    fired_at: tuple[float, float] | None  # set on the frame a shot fires (look-back applied)
    hand: Hand | None  # the player's hand, for drawing
    thumb_angle: float | None  # the player's hammer angle in degrees, for tuning
    # Everything behind the decision, for recordings (services/cv.py → Recorder).
    hands: list[TrackedHand]  # every distinct hand, largest first
    duplicates: list[Hand]  # detections dropped as a second copy of a hand above
    player_id: int | None
    slap: Slap | None = None  # set on the frame a slap is recognised
    pinching: bool = False
    slide: Slide | None = None


class PlayerGun:
    """The game's crosshair follows the fingertip midpoint; closing a pinch grabs a target.

    Every distinct hand in view keeps its own PinchTracker, so a second hand can't disturb the
    player's pinch. The player is the largest hand (closest to the camera) when the
    crosshair is acquired, and stays that hand for as long as it is tracked: choosing the largest
    hand on every frame made the crosshair jump between two hands of similar size. While the
    player's hand is briefly out of view (TRACK_TIMEOUT_S) the frame is "lost" even if another
    hand is visible, so a short dropout can't hand the crosshair to someone else."""

    def __init__(self, cooldown_ms: float = DEFAULT_COOLDOWN_MS) -> None:
        self.cooldown_ms = cooldown_ms
        self._tracks = GunTracks()
        self._tracks.pinch = True
        self.box: Box = (0.2, 0.15, 0.8, 0.75)
        self._player_id: int | None = None
        self._filter_x = OneEuroFilter(AIM_MIN_CUTOFF_HZ, AIM_BETA)
        self._filter_y = OneEuroFilter(AIM_MIN_CUTOFF_HZ, AIM_BETA)
        self._last_shot_ms: float | None = None
        self._last_seen_ms: float | None = None  # when the player's hand was last seen
        self._last_aim: tuple[float, float] | None = None
        self.trigger = DEFAULT_TRIGGER
        self._trigger_calibration: PinchCalibration | None = None
        # The player's recent palm positions (t, x, y) in frame widths, for slaps
        self._palms: deque[tuple[float, float, float]] = deque()
        self._palms_of: int | None = None  # whose palms they are
        self._slides: deque[tuple[float, float, float]] = deque()
        self._slide_outlines: deque[list[tuple[float, float]]] = deque()
        self._slides_of: int | None = None
        self._last_slap_s: float | None = None
        self._last_slide_s: float | None = None
        self._vanished: tuple[float, float, float] | None = None  # (t, x, y) when the hand went

    def update(
        self,
        detections: Sequence[Hand],
        width: int,
        height: int,
        timestamp_ms: float,
        motion: Motion | None = None,
    ) -> GestureFrame:
        hands, duplicates = drop_duplicate_hands(detections)
        readings = self._tracks.update(hands, width, height, timestamp_ms / 1000, self.trigger)
        ids = self._tracks.ids
        tracked = [TrackedHand(*hand) for hand in zip(ids, hands, readings, strict=True)]
        recently = (
            self._last_seen_ms is not None
            and timestamp_ms - self._last_seen_ms <= TRACK_TIMEOUT_S * 1000
        )
        if self._player_id not in ids and not recently:
            self._player_id = ids[0] if ids else None  # (re)acquire: the largest hand
        t = timestamp_ms / 1000
        # Back-of-hand swings can lose landmarks or retain an unreliable pose. Check raw
        # camera motion on every frame, including continued dropouts, independently of pose.
        # A visible, slowly moving hand belongs to the localized slide path, even if its
        # open fingers change many pixels. Keep raw-motion slaps for fast moves and dropouts.
        raw_is_fast = motion is not None and motion.speed >= SLAP_RAW_MIN_SPEED
        if self._player_id in ids and self._palms:
            previous_t, previous_x, previous_y = self._palms[-1]
            current_pts = to_points(hands[ids.index(self._player_id)], width, height)
            current = tuple(current_pts[:, :2].mean(axis=0) / width)
            raw_is_fast = raw_is_fast or (
                t > previous_t
                and math.hypot(current[0] - previous_x, current[1] - previous_y) / (t - previous_t)
                >= SLAP_MIN_SPEED
            )
        motion_slap = (
            self._slap(t, motion.dx)
            if raw_is_fast and motion is not None and motion.share >= SLAP_MIN_MOTION
            else None
        )
        if self._player_id not in ids:
            self._slides.clear()
            self._slide_outlines.clear()
            if not recently:
                self._last_aim = None
            return GestureFrame(
                "lost",
                self._last_aim,
                None,
                None,
                None,
                tracked,
                duplicates,
                self._player_id,
                slap=motion_slap or self._slap_on_vanishing(t, motion),
            )

        player = tracked[ids.index(self._player_id)]
        reading = player.reading
        self._last_seen_ms = timestamp_ms
        whole_hand = tuple(to_points(player.landmarks, width, height)[:, :2].mean(axis=0) / width)
        slap = (
            motion_slap
            or self._slap_on_reappearing(whole_hand, t)
            or self._slap_on_moving(self._player_id, whole_hand, t)
        )
        slide = self._slide_on_moving(player, width, height, t) if slap is None else None
        if self._trigger_calibration is not None:
            self._trigger_calibration.add(reading)
        midpoint = tuple(
            (player.landmarks[THUMB_TIP][axis] + player.landmarks[INDEX_TIP][axis]) / 2
            for axis in range(2)
        )
        raw_x, raw_y = to_game_area(midpoint, self.box)
        aim = (
            round(self._filter_x(min(max(raw_x, 0.0), 1.0), t), 4),
            round(self._filter_y(min(max(raw_y, 0.0), 1.0), t), 4),
        )
        self._last_aim = aim
        fired_at = None
        just_slapped = self._last_slap_s is not None and t - self._last_slap_s < SLAP_SHOT_BLOCK_S
        if (
            reading.shot
            and not just_slapped
            and self._trigger_calibration is None
            and (
                self._last_shot_ms is None or timestamp_ms - self._last_shot_ms >= self.cooldown_ms
            )
        ):
            self._last_shot_ms = timestamp_ms
            # A grab lands where the fingertips meet, without the old thumb-drop look-back.
            fired_at = (min(max(raw_x, 0.0), 1.0), min(max(raw_y, 0.0), 1.0))
        return GestureFrame(
            tracking="ok" if reading.gun else "noPose",
            aim=aim,
            fired_at=fired_at,
            hand=player.landmarks,
            thumb_angle=reading.hammer_angle,
            hands=tracked,
            duplicates=duplicates,
            player_id=self._player_id,
            slap=slap,
            pinching=reading.pinching,
            slide=slide,
        )

    def _slide_on_moving(
        self, player: TrackedHand, width: int, height: int, t: float
    ) -> Slide | None:
        """Open-hand sideways sweep: independent of palm orientation and slower than a slap."""
        reading = player.reading
        pts = to_points(player.landmarks, width, height)
        # Only exclude a pinch/degenerate hand; a flat hand need not pass finger-by-finger
        # extension tests. Detect movement using the centroid of all 21 landmarks.
        opened = (
            reading.gun
            and not reading.pinching
            and reading.pinch_distance is not None
            and reading.pinch_distance > self.trigger.pinch_open_above
        )
        if not opened or self._slides_of != player.id:
            self._slides.clear()
            self._slide_outlines.clear()
            self._slides_of = player.id
        if not opened:
            return None
        centre = pts[:, :2].mean(axis=0) / width
        self._slides.append((t, *centre))
        self._slide_outlines.append([to_game_area(point, self.box) for point in player.landmarks])
        while self._slides[0][0] < t - SLIDE_WINDOW_S:
            self._slides.popleft()
            self._slide_outlines.popleft()
        first, last = self._slides[0], self._slides[-1]
        dx, dy = last[1] - first[1], last[2] - first[2]
        if (
            last[0] - first[0] < SLIDE_MIN_DURATION_S
            or abs(dx) < SLIDE_MIN_DISTANCE
            or abs(dx) / max(last[0] - first[0], 0.001) < SLIDE_MIN_SPEED
            or abs(dx) < abs(dy) * 1.2
        ):
            return None
        travel = sum(
            math.hypot(b[1] - a[1], b[2] - a[2])
            for a, b in zip(self._slides, list(self._slides)[1:], strict=False)
        )
        if travel == 0 or math.hypot(dx, dy) / travel < SLIDE_MIN_DIRECTNESS:
            return None
        path = [to_game_area((p[1], p[2] * width / height), self.box) for p in self._slides]
        outlines = list(self._slide_outlines)
        if self._last_slide_s is not None and t - self._last_slide_s < SLIDE_COOLDOWN_S:
            return None
        self._last_slide_s = t
        self._slides.clear()
        self._slide_outlines.clear()
        # The camera image is mirrored on screen: moving to the image's right is a slide left
        return Slide("left" if dx > 0 else "right", path, 0.012, outlines)

    def _slap_on_moving(self, player_id: int, palm: tuple[float, float], t: float) -> Slap | None:
        """A slap when the palm moved SLAP_MIN_DISTANCE within SLAP_WINDOW_S."""
        if self._palms_of != player_id:  # another hand took over: its moves are its own
            self._palms.clear()
            self._palms_of = player_id
        self._palms.append((t, *palm))
        while self._palms[0][0] < t - SLAP_WINDOW_S:
            self._palms.popleft()
        _, x, y = self._palms[-1]
        far = max(self._palms, key=lambda p: math.hypot(x - p[1], y - p[2]))
        if math.hypot(x - far[1], y - far[2]) < SLAP_MIN_DISTANCE:
            return None
        return self._slap(t, x - far[1])

    def _slap_on_vanishing(self, t: float, motion: Motion | None) -> Slap | None:
        """A slap when the hand blurred out of view: it was moving fast, or the area around it
        changed sharply (checked on the first frame without it)."""
        if not self._palms:
            return None
        (t1, x1, y1) = self._palms[-1]
        self._vanished = (t, x1, y1)
        fast = None
        if len(self._palms) >= 2:
            (t0, x0, y0) = self._palms[-2]
            if t1 > t0 and math.hypot(x1 - x0, y1 - y0) / (t1 - t0) >= SLAP_MIN_SPEED:
                fast = x1 - x0
        self._palms.clear()
        if fast is not None:
            return self._slap(t, fast)
        if (
            motion is not None
            and motion.share >= SLAP_MIN_MOTION
            and motion.speed >= SLAP_RAW_MIN_SPEED
        ):
            return self._slap(t, motion.dx)
        return None

    def _slap_on_reappearing(self, palm: tuple[float, float], t: float) -> Slap | None:
        """A slap when the hand comes back soon, far from where it vanished."""
        vanished, self._vanished = self._vanished, None
        if vanished is None or t - vanished[0] > SLAP_REAPPEAR_S:
            return None
        dx, dy = palm[0] - vanished[1], palm[1] - vanished[2]
        elapsed = t - vanished[0]
        if (
            math.hypot(dx, dy) < SLAP_REAPPEAR_DISTANCE
            or elapsed <= 0
            or math.hypot(dx, dy) / elapsed < SLAP_MIN_SPEED
        ):
            return None
        return self._slap(t, dx)

    def _slap(self, t: float, dx: float) -> Slap | None:
        if self._last_slap_s is not None and t - self._last_slap_s < SLAP_COOLDOWN_S:
            return None
        self._last_slap_s = t
        self._slides.clear()
        self._slide_outlines.clear()
        self._vanished = None
        self._palms.clear()
        # The camera image is mirrored on screen: moving to the image's right is a slap left
        return "left" if dx > 0 else "right"

    def recenter(self) -> None:
        """Reset smoothing; fingertip aim is mapped directly through the camera box."""
        self._filter_x = OneEuroFilter(AIM_MIN_CUTOFF_HZ, AIM_BETA)
        self._filter_y = OneEuroFilter(AIM_MIN_CUTOFF_HZ, AIM_BETA)

    def calibrate_trigger(
        self, step: Literal["up", "down", "done", "reset"]
    ) -> tuple[TriggerThresholds | None, str | None]:
        """Collect open (up) and pinched (down) samples, then apply the learned thresholds."""
        if step in ("up", "done", "reset"):
            self._tracks.reset_pinches()
        if step == "reset":
            self.trigger, self._trigger_calibration = DEFAULT_TRIGGER, None
            return self.trigger, None
        if step in ("up", "down"):
            self._trigger_calibration = self._trigger_calibration or PinchCalibration()
            self._trigger_calibration.start(step)
            return self.trigger, None
        if self._trigger_calibration is None:
            return self.trigger, "Start with your index finger and thumb apart"
        thresholds, problem = self._trigger_calibration.result()
        self._trigger_calibration = None
        if thresholds is None:
            return self.trigger, problem
        self.trigger = thresholds
        return self.trigger, None
