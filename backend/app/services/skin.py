"""Skin tone measured from the avatar photo's pixels (never asked of the AI model).

MediaPipe's FaceLandmarker finds the face wherever it is in the frame, so the sample lands on the
cheeks and forehead even when the player isn't centred in the oval guide (the old fixed-spot
sampling then read hair, shadow or background, mostly too dark). The model file is downloaded
by frontend/build.js next to the shooter's hand model; without it this returns None and the
browser falls back to its oval-guide measurement.
"""

import io
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from app.config import REPO_DIR
from app.game_config import CONFIG

MODEL_NAME = "face_landmarker.task"
MODEL_CANDIDATES = (
    REPO_DIR / "frontend" / "dist" / "static" / "models" / MODEL_NAME,
    REPO_DIR / "frontend" / "public" / "models" / MODEL_NAME,
)

# Face-mesh landmarks on flat skin: both cheeks below the eyes, and the forehead centre
SKIN_POINTS = (50, 101, 118, 117, 123, 205, 280, 330, 347, 346, 352, 425, 10, 151, 9)
PATCH_RADIUS = 0.03  # of the face width, around each point
# The well-lit part of the sampled pixels: shadows under the cheekbones read too dark, glare too
# light (brightness percentiles)
LIT_BAND = (0.6, 0.95)
# Exposure still varies per photo. On 15 labeled studio portraits, landmark sampling picked the
# right preset for 11 with no offset and 10 with +4; webcams in normal rooms read darker than
# studio light, and players reported "too dark", so the measurement is brightened a little.
# (The whites of the eyes as an exposure reference scored worse: often half-closed or shaded.)
LIGHTNESS_OFFSET = 4.0

SKIN_PRESETS = CONFIG["colors"]["skin"]


@dataclass(frozen=True)
class SkinMeasurement:
    preset: str  # the preset hex value ProfileInput accepts
    measured: str  # the measured colour, for debugging
    lightness: float  # CIE L* of the measurement, before the offset


def lightness(rgb: np.ndarray) -> float:
    """Perceived lightness (CIE L*, 0–100) of an sRGB colour."""
    c = np.asarray(rgb, dtype=float) / 255
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = float(lin @ [0.2126, 0.7152, 0.0722])
    return 116 * y ** (1 / 3) - 16 if y > 0.008856 else 903.3 * y


def _hex(rgb: np.ndarray) -> str:
    return "#" + "".join(f"{int(round(v)):02X}" for v in rgb)


def _rgb(hex_value: str) -> np.ndarray:
    return np.array([int(hex_value[i : i + 2], 16) for i in (1, 3, 5)])


def nearest_preset(rgb: np.ndarray, offset: float = LIGHTNESS_OFFSET) -> str:
    """The skin preset closest in lightness; hue is unreliable under webcam colour casts."""
    target = lightness(rgb) + offset
    return min(_PRESET_LIGHTNESS, key=lambda value: abs(_PRESET_LIGHTNESS[value] - target))


def sample_skin(pixels: np.ndarray, points: np.ndarray) -> np.ndarray | None:
    """Typical skin colour around landmark `points` ((n, 2) in pixels) of an (h, w, 3) image."""
    height, width = pixels.shape[:2]
    face_width = float(np.ptp(points[:, 0])) or 1.0
    r = max(2, round(face_width * PATCH_RADIUS))
    patches = []
    for x, y in points[list(SKIN_POINTS)]:
        x0, x1 = max(0, round(x) - r), min(width, round(x) + r + 1)
        y0, y1 = max(0, round(y) - r), min(height, round(y) + r + 1)
        if x1 > x0 and y1 > y0:
            patches.append(pixels[y0:y1, x0:x1].reshape(-1, 3))
    if not patches:
        return None
    samples = np.concatenate(patches).astype(float)
    luma = samples @ [0.299, 0.587, 0.114]
    order = np.argsort(luma)
    lo, hi = (int(len(order) * f) for f in LIT_BAND)
    return np.median(samples[order[lo:hi]], axis=0)


class _FaceFinder:
    """One FaceLandmarker for the process, created on first use; MediaPipe calls are serialized
    (handlers run in a thread pool and the landmarker is not thread-safe)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._landmarker = None
        self._missing = False

    def landmarks(self, pixels: np.ndarray) -> np.ndarray | None:
        with self._lock:
            if self._landmarker is None and not self._missing:
                self._landmarker = self._create()
            if self._landmarker is None:
                return None
            import mediapipe as mp

            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(pixels))
            faces = self._landmarker.detect(image).face_landmarks
        if not faces:
            return None
        height, width = pixels.shape[:2]
        return np.array([(p.x * width, p.y * height) for p in faces[0]])

    def _create(self):
        path = next((p for p in MODEL_CANDIDATES if p.is_file()), None)
        if path is None:
            self._missing = True
            return None
        from mediapipe.tasks.python import BaseOptions, vision

        options = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(Path(path))), num_faces=1
        )
        return vision.FaceLandmarker.create_from_options(options)


_finder = _FaceFinder()


# Never let an unchecked image reach MediaPipe: a side of 32767 px or more aborts OpenCV and kills
# the server (CLAUDE.md → Gotchas). The header is checked before decoding; big photos are shrunk.
MAX_SIDE = 4096
WORK_SIDE = 640


def measure_skin(image_bytes: bytes) -> SkinMeasurement | None:
    """None when the image is unreadable or oversized, has no detectable face, or the face model
    isn't installed."""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        if max(image.size) > MAX_SIDE or min(image.size) < 1:
            return None
        image = image.convert("RGB")
    except (OSError, ValueError, Image.DecompressionBombError):
        return None
    image.thumbnail((WORK_SIDE, WORK_SIDE))
    pixels = np.asarray(image)
    points = _finder.landmarks(pixels)
    if points is None:
        return None
    rgb = sample_skin(pixels, points)
    if rgb is None:
        return None
    return SkinMeasurement(
        preset=nearest_preset(rgb), measured=_hex(rgb), lightness=round(lightness(rgb), 1)
    )


_PRESET_LIGHTNESS = {preset["value"]: lightness(_rgb(preset["value"])) for preset in SKIN_PRESETS}
