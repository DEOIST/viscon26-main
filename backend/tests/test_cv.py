"""The finger-detection engine's HTTP and WebSocket contract, with a scripted detector instead of
MediaPipe (tests/test_cv_mediapipe.py runs the real model)."""

import io
import struct
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from starlette.websockets import WebSocketDisconnect

from app.config import settings
from app.services import cv as cv_service
from app.services.gesture import Hand
from tests.hands import make_hand


class ScriptedDetector:
    """Returns the next scripted list of hands per frame; the last list repeats."""

    def __init__(self, *frames: list[Hand]) -> None:
        self.frames = list(frames) or [[]]
        self.timestamps: list[int] = []
        self.closed = False

    def detect(self, rgb, timestamp_ms: int) -> list[Hand]:
        assert rgb.ndim == 3 and rgb.shape[2] == 3  # decoded RGB pixels
        self.timestamps.append(timestamp_ms)
        return self.frames.pop(0) if len(self.frames) > 1 else self.frames[0]

    def close(self) -> None:
        self.closed = True


def jpeg(width: int = 64, height: int = 48) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (200, 180, 160)).save(buffer, format="JPEG")
    return buffer.getvalue()


def jpeg_claiming(width: int, height: int) -> bytes:
    """A JPEG header that claims a size but carries no pixels: tiny on the wire, huge if decoded."""
    components = bytes([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])  # count, then id/sampling/table
    # The length counts itself (2), precision (1), height (2), width (2) and the components.
    start_of_frame = b"\xff\xc0" + struct.pack(">HBHH", 7 + len(components), 8, height, width)
    scan = bytes([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0])
    start_of_scan = b"\xff\xda" + struct.pack(">H", 2 + len(scan)) + scan
    return b"\xff\xd8" + start_of_frame + components + start_of_scan


def png(width: int = 64, height: int = 48) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (200, 180, 160)).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def model_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    model = tmp_path / "hand_landmarker.task"
    model.write_bytes(b"fake model")
    monkeypatch.setattr(settings, "cv_model_path", model)
    return model


@pytest.fixture
def detectors(model_file: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[list]:
    """Every new session gets the next detector from this list (append before connecting)."""
    queue: list[ScriptedDetector] = []
    created: list[ScriptedDetector] = []

    def make(_model_path: Path) -> ScriptedDetector:
        detector = queue.pop(0) if queue else ScriptedDetector()
        created.append(detector)
        return detector

    monkeypatch.setattr(cv_service, "_make_detector", make)
    # The startup probe has its own tests below; here it would steal the scripted detectors.
    monkeypatch.setattr(cv_service, "_engine_error", lambda _model_path: None)
    yield queue
    assert all(detector.closed for detector in created), "a session leaked its detector"


def test_status_without_the_model_explains_how_to_get_it(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "cv_model_path", tmp_path / "missing.task")

    status = client.get("/api/cv/status").json()

    assert status["available"] is False
    assert "build" in status["reason"]


def test_status_with_a_working_engine_is_available(
    client: TestClient, model_file: Path, monkeypatch: pytest.MonkeyPatch
):
    probe = ScriptedDetector()
    monkeypatch.setattr(cv_service, "_make_detector", lambda _model_path: probe)

    status = client.get("/api/cv/status").json()

    assert probe.closed  # the probe started a detector and released it again
    assert status == {
        "available": True,
        "reason": None,
        "activeSessions": 0,
        "maxSessions": 4,
    }


def test_status_reports_an_engine_whose_native_library_cannot_load(
    client: TestClient, model_file: Path, monkeypatch: pytest.MonkeyPatch
):
    def broken(_model_path: Path):
        raise OSError("libEGL.so.1: cannot open shared object file")

    monkeypatch.setattr(cv_service, "_make_detector", broken)

    status = client.get("/api/cv/status").json()

    assert status["available"] is False
    assert "libEGL.so.1" in status["reason"]


def test_in_production_the_status_keeps_the_error_details_in_the_log(
    client: TestClient, model_file: Path, monkeypatch: pytest.MonkeyPatch
):
    def broken(_model_path: Path):
        raise OSError("libEGL.so.1: cannot open shared object file")

    monkeypatch.setattr(cv_service, "_make_detector", broken)
    monkeypatch.setattr(settings, "environment", "production")

    reason = client.get("/api/cv/status").json()["reason"]

    assert "libEGL" not in reason
    assert "server log" in reason


def test_a_failed_engine_start_is_retried_on_the_next_check(
    client: TestClient, model_file: Path, monkeypatch: pytest.MonkeyPatch
):
    attempts: list[Path] = []

    def flaky(model_path: Path):
        attempts.append(model_path)
        if len(attempts) == 1:
            raise RuntimeError("driver hiccup")
        return ScriptedDetector()

    monkeypatch.setattr(cv_service, "_make_detector", flaky)

    assert client.get("/api/cv/status").json()["available"] is False
    assert client.get("/api/cv/status").json()["available"] is True
    assert client.get("/api/cv/status").json()["available"] is True
    assert len(attempts) == 2  # a working engine is only started once


def test_the_stream_starts_with_ready_and_the_calibration_box(client: TestClient, detectors):
    with client.websocket_connect("/api/cv/stream") as ws:
        assert ws.receive_json() == {"type": "ready", "box": [0.2, 0.15, 0.8, 0.75]}


def test_frames_turn_into_aim_tracking_and_landmarks(client: TestClient, detectors):
    detectors.append(ScriptedDetector([make_hand(tip=(0.5, 0.45))]))

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        replies = []
        for _ in range(3):
            ws.send_bytes(jpeg())
            replies.append(ws.receive_json())

    assert [reply["tracking"] for reply in replies] == ["noPose", "noPose", "ok"]
    last = replies[-1]
    assert last["type"] == "frame"
    assert last["aim"] == pytest.approx([0.5, 0.5])
    assert last["firedAt"] is None
    assert len(last["landmarks"]) == 21
    assert last["processingMs"] >= 0


def test_no_hand_in_view_is_reported_as_lost(client: TestClient, detectors):
    detectors.append(ScriptedDetector([]))

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_bytes(jpeg())
        reply = ws.receive_json()

    assert reply["tracking"] == "lost"
    assert reply["aim"] is None
    assert reply["landmarks"] is None


def test_dropping_the_thumb_on_camera_fires_one_shot(client: TestClient, detectors):
    up, down = [make_hand(thumb_up=True)], [make_hand(thumb_up=False)]
    detectors.append(ScriptedDetector(up, up, up, up, down, down))

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        shots = []
        for _ in range(6):
            ws.send_bytes(jpeg())
            shots.append(ws.receive_json()["firedAt"])

    assert [shot is not None for shot in shots] == [False, False, False, False, True, False]


def test_timestamps_given_to_the_detector_always_increase(client: TestClient, detectors):
    detector = ScriptedDetector([])
    detectors.append(detector)

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        for _ in range(5):
            ws.send_bytes(jpeg())
            ws.receive_json()

    assert detector.timestamps == sorted(set(detector.timestamps))


def test_a_broken_frame_is_reported_and_the_stream_survives(client: TestClient, detectors):
    detectors.append(ScriptedDetector([make_hand()]))

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_bytes(b"definitely not a jpeg")
        error = ws.receive_json()
        ws.send_bytes(jpeg())
        reply = ws.receive_json()

    assert error == {"type": "error", "detail": "Unreadable frame"}
    assert reply["type"] == "frame"


def test_an_oversized_frame_is_refused(
    client: TestClient, detectors, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "cv_max_frame_bytes", 100)

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_bytes(jpeg())

        assert ws.receive_json() == {"type": "error", "detail": "Frame too large"}


def test_huge_frame_dimensions_are_refused(client: TestClient, detectors):
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_bytes(jpeg(2000, 1500))

        assert ws.receive_json() == {"type": "error", "detail": "Frame too large"}


def test_a_frame_claiming_absurd_dimensions_is_refused(client: TestClient, detectors):
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_bytes(jpeg_claiming(20_000, 20_000))  # trips Pillow's own decompression-bomb guard

        assert ws.receive_json() == {"type": "error", "detail": "Frame too large"}


@pytest.mark.parametrize(("width", "height"), [(32_767, 1), (1, 32_767), (1_400, 10)])
def test_a_frame_too_long_on_one_side_is_refused(
    client: TestClient, detectors, width: int, height: int
):
    # Few pixels in total, but a side of 32767 or more aborts OpenCV inside MediaPipe: a native
    # crash that would take the whole server down. It must never reach the detector.
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_bytes(jpeg(width, height))

        assert ws.receive_json() == {"type": "error", "detail": "Frame too large"}


def test_frames_must_be_jpeg(client: TestClient, detectors):
    # Pillow can parse dozens of formats; the camera only ever sends JPEG, so only JPEG is opened.
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_bytes(png())

        assert ws.receive_json() == {"type": "error", "detail": "Unreadable frame"}


def test_calibration_changes_the_box(client: TestClient, detectors):
    detectors.append(ScriptedDetector([make_hand(tip=(0.45, 0.45))]))

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_json({"type": "box", "box": [0.4, 0.35, 0.6, 0.55]})
        ready = ws.receive_json()
        for _ in range(3):
            ws.send_bytes(jpeg())
            reply = ws.receive_json()

    assert ready == {"type": "ready", "box": [0.4, 0.35, 0.6, 0.55]}
    assert reply["aim"] == pytest.approx([0.75, 0.5])  # mirrored 0.55 inside the 0.4–0.6 box


@pytest.mark.parametrize(
    "message",
    [
        {"type": "box", "box": [0.6, 0.35, 0.4, 0.55]},  # x1 < x0
        {"type": "box", "box": [0.1, 0.1, 1.5, 0.9]},  # outside the image
        {"type": "box", "box": [0.1, 0.2]},
        {"type": "box", "box": [0, 0, True, 1]},  # a boolean is not a coordinate
        {"type": "box", "box": [0, 0, 5e-324, 1]},  # no area: landmarks would become infinite
        {"type": "box", "box": [0.2, 0.15, 0.25, 0.75]},  # too narrow to aim with
        {"type": "settings", "cooldownMs": True},
        {"type": "dance"},
        ["box", [0.2, 0.15, 0.8, 0.75]],
    ],
)
def test_bad_control_messages_are_refused(client: TestClient, detectors, message):
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_json(message)

        assert ws.receive_json()["type"] == "error"


@pytest.mark.parametrize(
    "text",
    [
        "not json",
        '{"type": "box", "box": [NaN, 0.1, 0.9, 0.9]}',
        '{"type": "settings", "cooldownMs": Infinity}',
    ],
)
def test_malformed_control_text_is_refused(client: TestClient, detectors, text: str):
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_text(text)

        assert ws.receive_json()["type"] == "error"


def test_an_oversized_control_message_is_refused_unread(client: TestClient, detectors):
    # Parsing runs on the event loop: a megabyte of JSON would stall every player's stream.
    padded = {"type": "box", "box": [0.2, 0.15, 0.8, 0.75], "padding": "x" * 5_000}

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_json(padded)

        assert ws.receive_json() == {"type": "error", "detail": "Message too large"}


def test_a_full_engine_closes_new_streams_with_1013(
    client: TestClient, detectors, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "cv_max_sessions", 1)

    with client.websocket_connect("/api/cv/stream") as first:
        first.receive_json()
        assert client.get("/api/cv/status").json()["activeSessions"] == 1
        with (
            client.websocket_connect("/api/cv/stream") as second,
            pytest.raises(WebSocketDisconnect) as closed,
        ):
            second.receive_json()

    assert closed.value.code == 1013


def test_a_session_is_released_when_the_player_leaves(client: TestClient, detectors):
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()

    assert client.get("/api/cv/status").json()["activeSessions"] == 0


def test_an_idle_stream_is_closed_to_free_its_slot(
    client: TestClient, detectors, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "cv_idle_timeout_seconds", 0.05)

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()  # ready, and then the player's tab goes quiet
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()

    assert closed.value.code == 4000
    assert client.get("/api/cv/status").json()["activeSessions"] == 0


def test_control_messages_alone_do_not_keep_a_stream_alive(
    client: TestClient, detectors, monkeypatch: pytest.MonkeyPatch
):
    # Only camera frames count as activity, or a client could hold a slot with chatter.
    monkeypatch.setattr(settings, "cv_idle_timeout_seconds", 0.3)

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as closed:
            for _ in range(20):  # two seconds of control messages, no frames
                ws.send_json({"type": "settings", "cooldownMs": 100})
                ws.receive_json()
                time.sleep(0.1)

    assert closed.value.code == 4000


def test_a_detector_that_fails_to_close_still_frees_its_slot(client: TestClient, detectors):
    class BrokenClose(ScriptedDetector):
        def close(self) -> None:
            self.closed = True
            raise RuntimeError("native close failed")

    detectors.append(BrokenClose())
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()

    assert client.get("/api/cv/status").json()["activeSessions"] == 0


def test_an_unavailable_engine_closes_streams_with_1011(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "cv_model_path", tmp_path / "missing.task")

    with (
        client.websocket_connect("/api/cv/stream") as ws,
        pytest.raises(WebSocketDisconnect) as closed,
    ):
        ws.receive_json()

    assert closed.value.code == 1011


def _shots(ws, count: int) -> list[bool]:
    shots = []
    for _ in range(count):
        ws.send_bytes(jpeg())
        shots.append(ws.receive_json()["firedAt"] is not None)
    return shots


def test_the_default_cooldown_blocks_an_instant_second_shot(client: TestClient, detectors):
    up, down = [make_hand(thumb_up=True)], [make_hand(thumb_up=False)]
    detectors.append(ScriptedDetector(up, up, up, up, down, up, down))

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        assert _shots(ws, 7).count(True) == 1  # frames arrive milliseconds apart


def test_a_shorter_cooldown_setting_allows_quick_shots(client: TestClient, detectors):
    up, down = [make_hand(thumb_up=True)], [make_hand(thumb_up=False)]
    detectors.append(ScriptedDetector(up, up, up, up, down, up, down))

    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_json({"type": "settings", "cooldownMs": 0})
        assert ws.receive_json() == {"type": "settings", "cooldownMs": 0}
        assert _shots(ws, 7).count(True) == 2


@pytest.mark.parametrize("cooldown", [-1, 5000, "fast"])
def test_an_out_of_range_cooldown_is_refused(client: TestClient, detectors, cooldown):
    with client.websocket_connect("/api/cv/stream") as ws:
        ws.receive_json()
        ws.send_json({"type": "settings", "cooldownMs": cooldown})

        assert ws.receive_json()["type"] == "error"
