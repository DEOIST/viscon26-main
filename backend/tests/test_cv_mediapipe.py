"""The real engine end to end: MediaPipe's hand model on a real photo, through the WebSocket.

Skipped when the hand model hasn't been downloaded (the CI backend job doesn't build the
frontend). Locally, `make build` or `make dev` downloads it into frontend/public/models/.
The photo is pointing_up.jpg from MediaPipe's test assets (Apache License 2.0).
"""

from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.services import cv as cv_service

FIXTURE = Path(__file__).parent / "fixtures" / "pointing_up.jpg"
MODEL = settings.frontend_dist.parent / "public" / "models" / "hand_landmarker.task"

pytestmark = pytest.mark.skipif(not MODEL.is_file(), reason="hand model not downloaded")


@pytest.fixture(autouse=True)
def real_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "cv_model_path", MODEL)


def test_the_real_model_finds_the_pointing_hand_and_its_pose(client: TestClient):
    with client.websocket_connect("/api/cv/stream") as ws:
        assert ws.receive_json()["type"] == "ready"
        replies = []
        for _ in range(4):
            ws.send_bytes(FIXTURE.read_bytes())
            replies.append(ws.receive_json())

    last = replies[-1]
    assert last["tracking"] == "ok"  # index straight, the other fingers curled
    assert len(last["landmarks"]) == 21
    index_tip_y = last["landmarks"][8][1]
    assert index_tip_y == min(point[1] for point in last["landmarks"])  # pointing up
    assert last["processingMs"] < 200


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
