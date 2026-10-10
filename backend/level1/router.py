"""HTTP and WebSocket layer for the finger-detection engine (issue #13, docs/SHOOTER_CV.md).

Protocol on /api/cv/stream. The client keeps one frame in flight: it sends the next frame only
after the previous answer arrived, so slow networks lower the frame rate instead of piling up lag.

    server → {"type": "ready", "box": [x0, y0, x1, y1]}   once the engine is loaded
    client → binary JPEG frame (≤ CV_MAX_FRAME_BYTES)    server → {"type": "frame", ...CvFrame}
    client → {"type": "box", "box": [x0, y0, x1, y1]}    server → {"type": "ready", "box": [...]}
    client → {"type": "settings", "cooldownMs": 175}     server → the same message (athlete perk)
    client → {"type": "record", "on": true}              server → {"type": "record", "on", "dir"}
                                         saves frames to backend/captures/ (development only)
    client → {"type": "recenter"}                        server → the same message; the aim
                                         calibrates again (frames say tracking "calibrating")
    server → {"type": "error", "detail": "..."}          bad frame or message; the stream goes on

Close codes: 1013 = engine busy (try again later), 1011 = engine unavailable, 4000 = no frames
for CV_IDLE_TIMEOUT_SECONDS (e.g. a hidden tab), which frees the slot for the next player.
"""

import asyncio
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import TypeAdapter, ValidationError

from level1 import cv as cv_service
from level1.config import cv_settings
from level1.schemas import (
    CV_MAX_COOLDOWN_MS,
    CV_MIN_BOX_SPAN,
    CvControlMessage,
    CvRecenterMessage,
    CvRecordMessage,
    CvSettingsMessage,
    CvStatus,
)

router = APIRouter(prefix="/cv", tags=["cv"])

BUSY = 1013
UNAVAILABLE = 1011
IDLE = 4000
MAX_CONTROL_CHARS = 1024  # control messages are ~60 characters; parsing runs on the event loop
_CONTROL_MESSAGE: TypeAdapter[CvControlMessage] = TypeAdapter(CvControlMessage)


@router.get("/status")
def get_cv_status() -> CvStatus:
    return cv_service.get_cv_status()


@router.websocket("/stream")
async def stream_cv(websocket: WebSocket) -> None:
    await websocket.accept()
    session = await _open_session(websocket)
    if session is None:
        return
    try:
        await websocket.send_json({"type": "ready", "box": list(session.box)})
        await _serve(websocket, session)
    except WebSocketDisconnect:
        pass
    finally:
        await run_in_threadpool(session.close)


async def _open_session(websocket: WebSocket) -> cv_service.CvSession | None:
    try:
        return await run_in_threadpool(cv_service.open_session)
    except cv_service.EngineBusyError:
        await websocket.close(code=BUSY, reason="The finger-detection engine is busy")
    except cv_service.EngineUnavailableError as error:
        await websocket.close(code=UNAVAILABLE, reason=str(error)[:120])
    return None


async def _serve(websocket: WebSocket, session: cv_service.CvSession) -> None:
    """Answer every message until the player leaves. Only camera frames count as activity: a
    stream without frames for CV_IDLE_TIMEOUT_SECONDS (a hidden tab, or a client that only
    chatters) is closed to free its slot."""
    last_frame = time.monotonic()
    while True:
        idle_left = cv_settings.idle_timeout_seconds - (time.monotonic() - last_frame)
        try:
            message = await asyncio.wait_for(websocket.receive(), timeout=max(idle_left, 0))
        except TimeoutError:
            await websocket.close(code=IDLE, reason="No camera frames for a while")
            return
        if message["type"] == "websocket.disconnect":
            return
        if message.get("bytes") is not None:
            last_frame = time.monotonic()
            await websocket.send_json(await _frame_reply(session, message["bytes"]))
        else:
            await websocket.send_json(_control_reply(session, message.get("text")))


async def _frame_reply(session: cv_service.CvSession, frame: bytes) -> dict:
    if len(frame) > cv_settings.max_frame_bytes:
        return _error("Frame too large")
    try:
        result = await run_in_threadpool(session.process, frame)
    except cv_service.FrameError as error:
        return _error(str(error))
    return result.model_dump(by_alias=True)


def _control_reply(session: cv_service.CvSession, text: str | None) -> dict:
    if text is not None and len(text) > MAX_CONTROL_CHARS:
        return _error("Message too large")
    try:
        message = _CONTROL_MESSAGE.validate_json(text or "")
    except ValidationError as error:
        return _error(_control_error(error))
    if isinstance(message, CvRecenterMessage):
        session.recenter()
        return {"type": "recenter"}
    if isinstance(message, CvRecordMessage):
        folder = session.set_recording(message.on)
        return {"type": "record", "on": folder is not None, "dir": folder and str(folder)}
    if isinstance(message, CvSettingsMessage):
        session.set_cooldown(message.cooldown_ms)
        return {"type": "settings", "cooldownMs": message.cooldown_ms}
    session.set_box(message.box)
    return {"type": "ready", "box": list(session.box)}


def _control_error(error: ValidationError) -> str:
    """One readable sentence per message type; the schemas in app/schemas.py hold the rules."""
    first = error.errors()[0]
    if first["type"] == "json_invalid":
        return "Messages must be JSON"
    message_type = first["loc"][0] if first["loc"] else None
    if message_type == "box":
        return (
            "A box is [x0, y0, x1, y1] with 0 ≤ x0 < x1 ≤ 1 and 0 ≤ y0 < y1 ≤ 1, "
            f"each side at least {CV_MIN_BOX_SPAN}"
        )
    if message_type == "settings":
        return f"cooldownMs must be a number from 0 to {CV_MAX_COOLDOWN_MS}"
    if message_type == "record":
        return "on must be true or false"
    return "Unknown message"


def _error(detail: str) -> dict:
    return {"type": "error", "detail": detail}
