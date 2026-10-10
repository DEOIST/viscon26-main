"""The finger-detection engine (issue #13): camera frames in, finger-gun aim and shots out.

The browser sends small JPEG frames over a WebSocket (routers/cv.py). Each connection gets its
own MediaPipe HandLandmarker (VIDEO mode needs increasing timestamps per instance) and its own
GestureTracker (services/gesture.py). Frames are processed one at a time, in memory only, and
never stored. A session cap protects the server's CPU: about one core per player.
"""

import io
import logging
import threading
import time
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image, UnidentifiedImageError

from app.config import settings
from app.schemas import CvFrame, CvStatus
from app.services.gesture import (
    DEFAULT_CONFIG,
    Box,
    GestureConfig,
    GestureTracker,
    Hand,
    pick_hand,
    to_game_area,
)

log = logging.getLogger(__name__)

# Frames are 320 px wide in practice. A side of 32767 px or more aborts OpenCV inside MediaPipe
# (a native crash that kills the whole process), so each side is limited, not only the area.
MAX_FRAME_SIDE = 1280
MAX_FRAME_PIXELS = 1280 * 960
_lock = threading.Lock()
_active_sessions = 0
_working_models: set[Path] = set()  # model files a detector has started from


class EngineUnavailableError(Exception):
    """No model file, or MediaPipe can't load (the WebSocket closes with 1011)."""


class EngineBusyError(Exception):
    """Every session slot is taken (the WebSocket closes with 1013, try again later)."""


class FrameError(Exception):
    """A frame that can't be used; the stream reports it and continues."""


class HandDetector(Protocol):
    def detect(self, rgb: np.ndarray, timestamp_ms: int) -> list[Hand]: ...

    def close(self) -> None: ...


class MediaPipeDetector:
    def __init__(self, model_path: Path) -> None:
        from mediapipe.tasks.python import BaseOptions, vision

        options = vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,  # keep the closest one (gesture.pick_hand)
            min_hand_detection_confidence=0.6,
            min_hand_presence_confidence=0.6,
            min_tracking_confidence=0.5,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)

    def detect(self, rgb: np.ndarray, timestamp_ms: int) -> list[Hand]:
        import mediapipe as mp

        if max(rgb.shape[:2]) > MAX_FRAME_SIDE:  # last line of defence before native code
            raise FrameError("Frame too large")
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = self._landmarker.detect_for_video(image, timestamp_ms)
        return [
            Hand(
                image=tuple((point.x, point.y, point.z) for point in image_points),
                world=tuple((point.x, point.y, point.z) for point in world_points),
            )
            for image_points, world_points in zip(
                result.hand_landmarks, result.hand_world_landmarks, strict=True
            )
        ]

    def close(self) -> None:
        self._landmarker.close()


class CvSession:
    def __init__(self, detector: HandDetector, config: GestureConfig = DEFAULT_CONFIG) -> None:
        self._detector = detector
        self._tracker = GestureTracker(config)
        self._started = time.monotonic()
        self._last_timestamp_ms = -1
        self._closed = False

    @property
    def box(self) -> Box:
        return self._tracker.config.box

    def set_box(self, box: Box) -> None:
        self._tracker.set_box(box)

    def set_cooldown(self, cooldown_ms: float) -> None:
        self._tracker.set_cooldown(cooldown_ms)

    def process(self, jpeg: bytes) -> CvFrame:
        started = time.perf_counter()
        rgb = decode_frame(jpeg)
        # MediaPipe's VIDEO mode rejects timestamps that don't strictly increase.
        now_ms = int((time.monotonic() - self._started) * 1000)
        timestamp_ms = max(self._last_timestamp_ms + 1, now_ms)
        self._last_timestamp_ms = timestamp_ms
        hand = pick_hand(self._detector.detect(rgb, timestamp_ms))
        gesture = self._tracker.update(hand, timestamp_ms)
        return CvFrame(
            tracking=gesture.tracking,
            aim=gesture.aim,
            fired_at=gesture.fired_at,
            landmarks=(
                [to_game_area(point, self.box, clamp=False) for point in hand.image]
                if hand
                else None
            ),
            thumb_distance=gesture.thumb_distance,
            processing_ms=round((time.perf_counter() - started) * 1000, 1),
        )

    def close(self) -> None:
        global _active_sessions
        if self._closed:
            return
        self._closed = True
        try:
            self._detector.close()
        except Exception:
            log.exception("A hand detector failed to close")
        finally:  # the slot must come back, or the engine shrinks until a restart
            with _lock:
                _active_sessions -= 1


def get_cv_status() -> CvStatus:
    reason = _unavailable_reason()
    return CvStatus(
        available=reason is None,
        reason=reason,
        active_sessions=_active_sessions,
        max_sessions=settings.cv_max_sessions,
    )


def open_session() -> CvSession:
    """Reserve a slot and start a detector: ~2 s cold, well under 0.2 s once a status check
    (the shooter's intro screen) has warmed MediaPipe up."""
    global _active_sessions
    reason = _unavailable_reason()
    if reason is not None:
        raise EngineUnavailableError(reason)
    with _lock:
        if _active_sessions >= settings.cv_max_sessions:
            raise EngineBusyError
        _active_sessions += 1
    try:
        detector = _make_detector(settings.cv_model_path)
    except Exception as error:
        with _lock:
            _active_sessions -= 1
        log.exception("The hand model failed to load")
        raise EngineUnavailableError(
            f"The hand model failed to load: {type(error).__name__}"
        ) from error
    return CvSession(detector)


def decode_frame(jpeg: bytes) -> np.ndarray:
    try:
        # Reads the header only. JPEG only: the camera never sends anything else, and every other
        # parser Pillow has is attack surface for anonymous clients.
        image = Image.open(io.BytesIO(jpeg), formats=["JPEG"])
        if max(image.size) > MAX_FRAME_SIDE or image.width * image.height > MAX_FRAME_PIXELS:
            raise FrameError("Frame too large")
        return np.asarray(image.convert("RGB"))
    except Image.DecompressionBombError as error:  # a few bytes that claim gigapixels
        raise FrameError("Frame too large") from error
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise FrameError("Unreadable frame") from error


def _unavailable_reason() -> str | None:
    if not settings.cv_model_path.is_file():
        return "Hand model missing: run the frontend build, which downloads it"
    return _engine_error(settings.cv_model_path)


def _engine_error(model_path: Path) -> str | None:
    """Start one detector and close it again: the only reliable test. Importing MediaPipe isn't
    enough, because its native library loads later and needs system libraries (libEGL, libGLES)
    that a slim image may lack. Only success is remembered (the first start takes ~2 s), so a
    failed start is retried on the next check."""
    if model_path in _working_models:
        return None
    try:
        _make_detector(model_path).close()
    except Exception as error:  # missing system libraries raise OSError, not ImportError
        log.warning("The finger-detection engine can't start", exc_info=True)
        if settings.environment == "production":  # anyone can read the status: no internals
            return "MediaPipe can't start; the server log has the details"
        return f"MediaPipe can't start: {type(error).__name__}: {error}"
    _working_models.add(model_path)
    return None


def _make_detector(model_path: Path) -> HandDetector:
    return MediaPipeDetector(model_path)
