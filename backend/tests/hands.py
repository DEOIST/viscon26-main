"""Synthetic hands for gesture tests: 21 MediaPipe landmarks built from finger states, so tests
need no camera, no model and no images. Indices follow MediaPipe: 0 wrist, 1–4 thumb,
5–8 index, 9–12 middle, 13–16 ring, 17–20 pinky."""

from app.services.gesture import Hand

# World landmarks are in metres with the palm in the x/y plane; fingers point towards +y.
_MCP_X = {"index": -0.025, "middle": 0.0, "ring": 0.022, "pinky": 0.042}
_MCP_Y = 0.09
_PHALANX = 0.03


def _finger(name: str, straight: bool) -> list[tuple[float, float, float]]:
    x = _MCP_X[name]
    mcp = (x, _MCP_Y, 0.0)
    pip = (x, _MCP_Y + _PHALANX, 0.0)
    if straight:
        dip = (x, _MCP_Y + 2 * _PHALANX, 0.0)
        tip = (x, _MCP_Y + 3 * _PHALANX, 0.0)
    else:  # folded back towards the palm: about 60° at the PIP joint
        dip = (x, _MCP_Y + _PHALANX + 0.012, -0.02)
        tip = (x, _MCP_Y + 0.015, -0.026)
    return [mcp, pip, dip, tip]


def _thumb(up: bool) -> list[tuple[float, float, float]]:
    # Up (cocked): tip ~7 cm from the index MCP. Down: tip resting on the index side, ~2 cm.
    if up:
        return [(-0.03, 0.02, 0.0), (-0.05, 0.04, 0.0), (-0.065, 0.07, 0.0), (-0.075, 0.12, 0.0)]
    return [(-0.03, 0.02, 0.0), (-0.045, 0.05, 0.0), (-0.04, 0.08, 0.0), (-0.035, 0.105, 0.0)]


def make_hand(
    *,
    index: bool = True,
    middle: bool = False,
    ring: bool = False,
    pinky: bool = False,
    thumb_up: bool = True,
    thumb_gap: float | None = None,
    tip: tuple[float, float] = (0.5, 0.45),
    size: float = 0.15,
) -> Hand:
    """A hand whose index fingertip sits at `tip` in image coordinates (camera view, not
    mirrored). `size` is the wrist→middle-MCP distance in the image, i.e. how close it is.
    `thumb_gap` places the thumb tip exactly that many metres from the index MCP."""
    world = [(0.0, 0.0, 0.0)]
    world += _thumb(thumb_up)
    if thumb_gap is not None:
        world[4] = (_MCP_X["index"] - thumb_gap, _MCP_Y, 0.0)
    world += _finger("index", index)
    world += _finger("middle", middle)
    world += _finger("ring", ring)
    world += _finger("pinky", pinky)
    tip_x, tip_y = tip
    wrist = (tip_x, tip_y + 2.2 * size, 0.0)
    image = [
        (wrist[0] + wx / _MCP_Y * size, wrist[1] - wy / _MCP_Y * size, wz) for wx, wy, wz in world
    ]
    image[8] = (tip_x, tip_y, 0.0)  # pin the fingertip exactly where the test wants it
    return Hand(image=tuple(image), world=tuple(world))
