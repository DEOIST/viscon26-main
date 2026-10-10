"""Synthetic hands for gesture tests: 21 MediaPipe image landmarks built from finger states, so
tests need no camera, no model and no images. Indices follow MediaPipe: 0 wrist, 1–4 thumb,
5–8 index, 9–12 middle, 13–16 ring, 17–20 pinky."""

import math

from level1.gesture import Hand

# The hand is built upright in metres, palm in the x/y plane, fingers towards +y and the camera
# at -z, then scaled into the image (where y points down; z is scaled like x, as MediaPipe does).
_MCP_X = {"index": -0.025, "middle": 0.0, "ring": 0.022, "pinky": 0.042}
_MCP_Y = 0.09
_PHALANX = 0.03
_THUMB_MCP = (-0.05, 0.04)
_THUMB_LENGTH = 0.06  # thumb MCP to tip

# Thumb angles from straight up: clearly cocked and clearly dropped, even after a 4:3 frame
# stretches x against y.
THUMB_UP_DEGREES = 15.0
THUMB_DOWN_DEGREES = 70.0


def _finger(name: str, straight: bool) -> list[tuple[float, float, float]]:
    x = _MCP_X[name]
    mcp = (x, _MCP_Y, 0.0)
    pip = (x, _MCP_Y + _PHALANX, 0.0)
    if straight:
        dip = (x, _MCP_Y + 2 * _PHALANX, 0.0)
        tip = (x, _MCP_Y + 3 * _PHALANX, 0.0)
    else:  # folded back towards the palm: the tip ends closer to the wrist than the PIP
        dip = (x, _MCP_Y + _PHALANX + 0.012, -0.02)
        tip = (x, _MCP_Y + 0.015, -0.026)
    return [mcp, pip, dip, tip]


def _index_at_camera() -> list[tuple[float, float, float]]:
    """The gun's barrel: pointing at the camera, so it looks short (and dips slightly)."""
    x = _MCP_X["index"]
    return [(x, _MCP_Y, 0.0), (x, 0.085, -0.025), (x, 0.082, -0.04), (x, 0.08, -0.055)]


def _thumb(degrees: float) -> list[tuple[float, float, float]]:
    """Up is 0°; dropping it tilts the thumb towards the index finger (+x)."""
    mcp_x, mcp_y = _THUMB_MCP
    dx, dy = math.sin(math.radians(degrees)), math.cos(math.radians(degrees))
    ip = (mcp_x + dx * _THUMB_LENGTH / 2, mcp_y + dy * _THUMB_LENGTH / 2, 0.0)
    tip = (mcp_x + dx * _THUMB_LENGTH, mcp_y + dy * _THUMB_LENGTH, 0.0)
    return [(-0.03, 0.02, 0.0), (mcp_x, mcp_y, 0.0), ip, tip]


def _folded_thumb() -> list[tuple[float, float, float]]:
    """Dropped forward, toward the camera: the thumb folds over the fist and looks short, while
    its angle from straight up stays small (MediaPipe compresses depth: ~33°)."""
    mcp_x, mcp_y = _THUMB_MCP
    ip = (mcp_x + 0.004, mcp_y + 0.012, -0.006)
    tip = (mcp_x + 0.008, mcp_y + 0.022, -0.012)
    return [(-0.03, 0.02, 0.0), (mcp_x, mcp_y, 0.0), ip, tip]


def _swapped_thumb_and_index() -> list[tuple[float, float, float]]:
    """MediaPipe's mistake with an upright thumb: the thumb chain laid sideways along the curled
    fingers, and the index chain on the upright thumb (straight up, extended)."""
    thumb = [(-0.03, 0.02, 0.0), (-0.02, 0.05, 0.0), (0.0, 0.06, 0.0), (0.02, 0.06, 0.0)]
    index = [(-0.045, 0.06, 0.0), (-0.05, 0.09, 0.0), (-0.052, 0.11, 0.0), (-0.055, 0.13, 0.0)]
    return thumb + index


def make_hand(
    *,
    middle: bool = False,
    ring: bool = False,
    pinky: bool = False,
    thumb_up: bool = True,
    thumb_degrees: float | None = None,
    thumb_folded: bool = False,
    swapped: bool = False,
    tip: tuple[float, float] = (0.5, 0.45),
    size: float = 0.15,
) -> Hand:
    """A finger gun whose index fingertip sits at `tip` in image coordinates (camera view, not
    mirrored). `size` is the wrist→middle-MCP distance in the image, i.e. how close it is.
    `thumb_degrees` overrides `thumb_up` with an exact thumb angle from straight up (exact in the
    image when the frame is square). `thumb_folded` drops it forward instead, toward the camera.
    `swapped` labels an upright thumb the way MediaPipe sometimes does (see
    app/services/gesture.py)."""
    if thumb_degrees is None:
        thumb_degrees = THUMB_UP_DEGREES if thumb_up else THUMB_DOWN_DEGREES
    world = [(0.0, 0.0, 0.0)]
    if swapped:
        world += _swapped_thumb_and_index()
    else:
        world += (_folded_thumb() if thumb_folded else _thumb(thumb_degrees)) + _index_at_camera()
    world += _finger("middle", middle)
    world += _finger("ring", ring)
    world += _finger("pinky", pinky)
    scale = size / _MCP_Y
    index_tip = _index_at_camera()[-1]  # also for a swapped hand: same palm, other labels
    wrist = (tip[0] - index_tip[0] * scale, tip[1] + index_tip[1] * scale)
    return tuple((wrist[0] + wx * scale, wrist[1] - wy * scale, wz * scale) for wx, wy, wz in world)


def recoil_hand(hand: Hand, lift: float, sideways: float = 0.0) -> Hand:
    """Lift the index around its knuckle, leaving the palm and thumb alone. Displacements use
    the middle-to-pinky knuckle span in the image; square frames give exact palm-width units."""
    span = math.dist(hand[9][:2], hand[17][:2])
    raised = list(hand)
    for index, fraction in ((6, 1 / 3), (7, 2 / 3), (8, 1.0)):
        x, y, z = hand[index]
        raised[index] = (x + sideways * span * fraction, y - lift * span * fraction, z)
    return tuple(raised)
