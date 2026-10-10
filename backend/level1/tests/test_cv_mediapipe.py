"""The real engine end to end: MediaPipe's hand model on a real photo, through the WebSocket.

Skipped when the hand model hasn't been downloaded (the CI backend job doesn't build the
frontend). Locally, `make build` downloads it into frontend/public/models/.
The photos are described in tests/fixtures/README.md.
"""

import io
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from level1 import cv as cv_service
from level1.config import MODEL_CANDIDATES, cv_settings
from level1.gesture import CALIBRATION_FRAMES

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE = FIXTURES / "pointing_up.jpg"
AIM_PHOTOS = ["aim1", "aim2", "aim3", "aim4"]
MODEL = next((path for path in MODEL_CANDIDATES if path.is_file()), MODEL_CANDIDATES[0])

pytestmark = pytest.mark.skipif(not MODEL.is_file(), reason="hand model not downloaded")


@pytest.fixture(autouse=True)
def real_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cv_settings, "model_path", MODEL)


def test_the_real_model_finds_the_pointing_hand_and_its_pose(client: TestClient):
    with client.websocket_connect("/api/cv/stream") as ws:
        assert ws.receive_json()["type"] == "ready"
        replies = []
        for _ in range(4):
            ws.send_bytes(FIXTURE.read_bytes())
            replies.append(ws.receive_json())

    last = replies[-1]
    assert last["tracking"] == "calibrating"  # a finger gun (ring and pinky curled), held still
    assert len(last["landmarks"]) == 21
    index_tip_y = last["landmarks"][8][1]
    assert index_tip_y == min(point[1] for point in last["landmarks"])  # pointing up
    assert last["processingMs"] < 200


def _stream(client: TestClient, photos: list[bytes | str]) -> list[dict]:
    """One reply per photo (a fixture name or JPEG bytes), sent in order on one stream."""
    with client.websocket_connect("/api/cv/stream") as ws:
        assert ws.receive_json()["type"] == "ready"
        replies = []
        for photo in photos:
            ws.send_bytes(
                photo if isinstance(photo, bytes) else (FIXTURES / f"{photo}.jpg").read_bytes()
            )
            replies.append(ws.receive_json())
    return replies


def _moved(name: str, dx: float) -> bytes:
    """The photo with everything shifted right by dx of its width: the hand moved."""
    image = Image.open(FIXTURES / f"{name}.jpg")
    moved = Image.new("RGB", image.size)
    moved.paste(image, (round(dx * image.width), 0))
    buffer = io.BytesIO()
    moved.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


@pytest.mark.parametrize("name", AIM_PHOTOS)
def test_the_aim_photos_are_cocked_finger_guns(client: TestClient, name: str):
    (reply,) = _stream(client, [name])
    assert reply["tracking"] == "calibrating"  # in pose: not "noPose"
    assert reply["thumbAngle"] < 32


def test_the_aim_follows_the_hand_mirrored(client: TestClient):
    # Calibrated on aim1, then the hand moves left in the camera: right on the (mirrored) screen.
    replies = _stream(client, ["aim1"] * CALIBRATION_FRAMES + [_moved("aim1", -0.1)] * 30)
    assert replies[CALIBRATION_FRAMES - 1]["aim"] == pytest.approx([0.5, 0.5], abs=0.02)
    assert replies[-1]["aim"][0] > 0.75
    assert replies[-1]["aim"][1] == pytest.approx(0.5, abs=0.05)


def test_dropping_the_thumb_fires_one_shot(client: TestClient):
    replies = _stream(client, ["aim1"] * CALIBRATION_FRAMES + ["shoot1"] * 3)[CALIBRATION_FRAMES:]
    assert replies[0]["thumbAngle"] > 55
    assert [reply["firedAt"] is not None for reply in replies] == [False, True, False]
    assert replies[1]["firedAt"] == pytest.approx([0.5, 0.5], abs=0.02)  # aimed where calibrated


def test_the_engine_reports_available_with_the_real_model(client: TestClient):
    assert cv_service.get_cv_status().available is True


def test_the_detector_refuses_an_oversized_frame_before_native_code():
    # A side of 32767 px would abort the process inside OpenCV; 2000 px shows the guard works
    # without risking that crash if it ever regresses.
    detector = cv_service.MediaPipeDetector(MODEL)
    try:
        with pytest.raises(cv_service.FrameError):
            detector.detect(np.zeros((1, 2_000, 3), dtype=np.uint8), 1)
    finally:
        detector.close()
