"""HTTP and WebSocket layer for the finger-detection engine (issue #13, docs/SHOOTER_CV.md).

Protocol on /api/cv/stream. The client keeps one frame in flight: it sends the next frame only
after the previous answer arrived, so slow networks lower the frame rate instead of piling up lag.

    server → {"type": "ready", "box": [x0, y0, x1, y1]}   once the engine is loaded
    client → binary JPEG frame (≤ CV_MAX_FRAME_BYTES)    server → {"type": "frame", ...CvFrame}
    client → {"type": "box", "box": [x0, y0, x1, y1]}    server → {"type": "ready", "box": [...]}
    client → {"type": "settings", "cooldownMs": 175}     server → the same message (athlete perk)
    server → {"type": "error", "detail": "..."}          bad frame or message; the stream goes on

Close codes: 1013 = engine busy (try again later), 1011 = engine unavailable, 4000 = no frames
for CV_IDLE_TIMEOUT_SECONDS (e.g. a hidden tab), which frees the slot for the next player.
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.schemas import CvStatus
from app.services import cv as cv_service

router = APIRouter(prefix="/cv", tags=["cv"])

BUSY = 1013
UNAVAILABLE = 1011
IDLE = 4000
MAX_COOLDOWN_MS = 2000


@router.get("/status")
def get_cv_status() -> CvStatus:
    return cv_service.get_cv_status()


@router.websocket("/stream")
async def stream_cv(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        session = await run_in_threadpool(cv_service.open_session)
    except cv_service.EngineBusyError:
        await websocket.close(code=BUSY, reason="The finger-detection engine is busy")
        return
    except cv_service.EngineUnavailableError as error:
        await websocket.close(code=UNAVAILABLE, reason=str(error)[:120])
        return
    try:
        await websocket.send_json({"type": "ready", "box": list(session.box)})
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive(), timeout=settings.cv_idle_timeout_seconds
                )
            except TimeoutError:
                await websocket.close(code=IDLE, reason="No camera frames for a while")
                break
            if message["type"] == "websocket.disconnect":
                break
            if message.get("bytes") is not None:
                await websocket.send_json(await _frame_reply(session, message["bytes"]))
            else:
                await websocket.send_json(_control_reply(session, message.get("text")))
    except WebSocketDisconnect:
        pass
    finally:
        await run_in_threadpool(session.close)


async def _frame_reply(session: cv_service.CvSession, frame: bytes) -> dict:
    if len(frame) > settings.cv_max_frame_bytes:
        return _error("Frame too large")
    try:
        result = await run_in_threadpool(session.process, frame)
    except cv_service.FrameError as error:
        return _error(str(error))
    return result.model_dump(by_alias=True)


def _control_reply(session: cv_service.CvSession, text: str | None) -> dict:
    try:
        message = json.loads(text or "")
    except json.JSONDecodeError:
        return _error("Messages must be JSON")
    if not isinstance(message, dict):
        return _error("Unknown message")
    if message.get("type") == "settings":
        return _settings_reply(session, message.get("cooldownMs"))
    if message.get("type") != "box":
        return _error("Unknown message")
    box = message.get("box")
    if not _is_valid_box(box):
        return _error("A box is [x0, y0, x1, y1] with 0 ≤ x0 < x1 ≤ 1 and 0 ≤ y0 < y1 ≤ 1")
    session.set_box(tuple(float(value) for value in box))
    return {"type": "ready", "box": list(session.box)}


def _settings_reply(session: cv_service.CvSession, cooldown: object) -> dict:
    is_number = isinstance(cooldown, int | float) and not isinstance(cooldown, bool)
    if not is_number or not 0 <= cooldown <= MAX_COOLDOWN_MS:
        return _error(f"cooldownMs must be a number from 0 to {MAX_COOLDOWN_MS}")
    session.set_cooldown(float(cooldown))
    return {"type": "settings", "cooldownMs": cooldown}


def _is_valid_box(box: object) -> bool:
    if not isinstance(box, list) or len(box) != 4:
        return False
    if not all(isinstance(value, int | float) for value in box):
        return False
    x0, y0, x1, y1 = box
    return 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1


def _error(detail: str) -> dict:
    return {"type": "error", "detail": detail}
