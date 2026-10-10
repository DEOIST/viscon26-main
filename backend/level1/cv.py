"""The finger-detection engine (issue #13): camera frames in, finger-gun aim and shots out.

The browser sends small JPEG frames over a WebSocket (router.py). Each connection gets its
own MediaPipe HandLandmarker (VIDEO mode needs increasing timestamps per instance) and its own
PlayerGun (gesture.py). Frames are processed one at a time, in memory only, and
never stored, except in a developer's explicit recording (Recorder, development only). A session
cap protects the server's CPU: about one core per player.
"""

import io
import json
import logging
import threading
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Literal, Protocol

import numpy as np
from PIL import Image, UnidentifiedImageError

from app.config import BACKEND_DIR, settings
from level1.config import cv_settings
from level1.gesture import Box, GestureFrame, Hand, PlayerGun, to_game_area
from level1.schemas import CvFrame, CvStatus, CvTriggerReply, CvTriggerThresholds

log = logging.getLogger(__name__)

# Frames are 640 px wide in practice. A side of 32767 px or more aborts OpenCV inside MediaPipe
# (a native crash that kills the whole process), so each side is limited, not only the area.
MAX_FRAME_SIDE = 1280
MAX_FRAME_PIXELS = 1280 * 960
# The game area's share of the mirrored camera image until the browser sends one fitted to its
# camera (input/box.ts). Only the hand skeleton uses it; the aim has its own gains.
DEFAULT_BOX: Box = (0.2, 0.15, 0.8, 0.75)
# MediaPipe's default 0.5 drops small, foreshortened gun hands (fist pointing at the camera) and
# re-detects them, which loses frames and sometimes reports the hand twice. On a two-hand
# recording 0.3 cut frames missing a visible hand from 24 to 10, longest gap from 5 frames to 1,
# and duplicates from 16 to 0, with no false hands on any recording (0.2 added one).
HAND_CONFIDENCE = 0.3
RECORDINGS_DIR = BACKEND_DIR / "captures"  # git-ignored; one folder per recording
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
            num_hands=2,  # the largest is the player (gesture.PlayerGun)
            min_hand_detection_confidence=HAND_CONFIDENCE,
            min_hand_presence_confidence=HAND_CONFIDENCE,
            min_tracking_confidence=HAND_CONFIDENCE,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)

    def detect(self, rgb: np.ndarray, timestamp_ms: int) -> list[Hand]:
        import mediapipe as mp

        if max(rgb.shape[:2]) > MAX_FRAME_SIDE:  # last line of defence before native code
            raise FrameError("Frame too large")
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = self._landmarker.detect_for_video(image, timestamp_ms)
        return [
            tuple((point.x, point.y, point.z) for point in hand) for hand in result.hand_landmarks
        ]

    def close(self) -> None:
        self._landmarker.close()


def _rounded(hand: Hand) -> list[list[float]]:
    return [[round(coordinate, 4) for coordinate in point] for point in hand]


class Recorder:
    """Saves each frame exactly as received (00000.jpg, ...) and, per frame, what the engine
    measured and decided (frames.jsonl), to find out why a shot fired or the aim jittered. Rows
    hold the landmarks too, so a recording can be replayed through the gesture rules alone."""

    def __init__(self) -> None:
        self.dir = RECORDINGS_DIR / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        self.dir.mkdir(parents=True)
        self._rows = (self.dir / "frames.jsonl").open("w")
        self._count = 0

    def write(
        self,
        jpeg: bytes,
        size: tuple[int, int],
        timestamp_ms: int,
        gesture: GestureFrame,
        reply: CvFrame,
    ) -> None:
        name = f"{self._count:05d}.jpg"
        (self.dir / name).write_bytes(jpeg)
        row = {
            "frame": name,
            "size": size,
            "t_ms": timestamp_ms,
            "reply": reply.model_dump(
                by_alias=False, include={"tracking", "aim", "fired_at", "processing_ms"}
            ),
            "hands": [
                {
                    "id": hand.id,
                    "player": hand.id == gesture.player_id,
                    **asdict(hand.reading),
                    "landmarks": _rounded(hand.landmarks),
                }
                for hand in gesture.hands
            ],
            # Detections dropped as a second copy of a hand above, kept to tune that rule.
            "duplicates": [_rounded(hand) for hand in gesture.duplicates],
        }
        self._rows.write(json.dumps(row) + "\n")
        self._count += 1

    def close(self) -> None:
        self._rows.close()
        log.info("Saved %d camera frames to %s", self._count, self.dir)


class CvSession:
    def __init__(self, detector: HandDetector) -> None:
        self._detector = detector
        self._gun = PlayerGun()
        self.box = DEFAULT_BOX
        self._recorder: Recorder | None = None
        self._started = time.monotonic()
        self._last_timestamp_ms = -1
        self._closed = False

    def set_box(self, box: Box) -> None:
        self.box = box

    def set_cooldown(self, cooldown_ms: float) -> None:
        self._gun.cooldown_ms = cooldown_ms

    def recenter(self) -> None:
        self._gun.recenter()

    def calibrate_trigger(self, step: Literal["up", "down", "done", "reset"]) -> CvTriggerReply:
        trigger, problem = self._gun.calibrate_trigger(step)
        return CvTriggerReply(
            step=step,
            ok=problem is None,
            detail=problem,
            thresholds=CvTriggerThresholds(**asdict(trigger)),
        )

    def set_recording(self, on: bool) -> Path | None:
        """Starts or stops a Recorder; returns its folder while recording. Development only:
        anyone can open a stream, and a production server must never store camera frames."""
        if on and self._recorder is None and settings.environment == "development":
            try:
                self._recorder = Recorder()
            except OSError:  # e.g. the container's user may not write there: report "off"
                log.warning("Can't record camera frames to %s", RECORDINGS_DIR, exc_info=True)
                return None
            log.info("Recording camera frames to %s", self._recorder.dir)
        elif not on and self._recorder is not None:
            self._recorder.close()
            self._recorder = None
        return self._recorder.dir if self._recorder else None

    def process(self, jpeg: bytes) -> CvFrame:
        started = time.perf_counter()
        rgb = decode_frame(jpeg)
        # MediaPipe's VIDEO mode rejects timestamps that don't strictly increase.
        now_ms = int((time.monotonic() - self._started) * 1000)
        timestamp_ms = max(self._last_timestamp_ms + 1, now_ms)
        self._last_timestamp_ms = timestamp_ms
        height, width = rgb.shape[:2]
        hands = self._detector.detect(rgb, timestamp_ms)
        gesture = self._gun.update(hands, width, height, timestamp_ms)
        reply = CvFrame(
            tracking=gesture.tracking,
            aim=gesture.aim,
            fired_at=gesture.fired_at,
            landmarks=(
                [to_game_area(point, self.box) for point in gesture.hand] if gesture.hand else None
            ),
            thumb_angle=gesture.thumb_angle,
            processing_ms=round((time.perf_counter() - started) * 1000, 1),
            slap=gesture.slap,
        )
        if self._recorder:
            self._recorder.write(jpeg, (width, height), timestamp_ms, gesture, reply)
        return reply

    def close(self) -> None:
        global _active_sessions
        if self._closed:
            return
        self._closed = True
        try:
            self.set_recording(False)
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
        max_sessions=cv_settings.max_sessions,
    )


def open_session() -> CvSession:
    """Reserve a slot and start a detector: ~2 s cold, well under 0.2 s once a status check
    (the shooter's intro screen) has warmed MediaPipe up."""
    global _active_sessions
    reason = _unavailable_reason()
    if reason is not None:
        raise EngineUnavailableError(reason)
    with _lock:
        if _active_sessions >= cv_settings.max_sessions:
            raise EngineBusyError
        _active_sessions += 1
    try:
        detector = _make_detector(cv_settings.model_path)
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
    if not cv_settings.model_path.is_file():
        return "Hand model missing: run the frontend build, which downloads it"
    return _engine_error(cv_settings.model_path)


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
