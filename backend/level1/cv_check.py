"""Stream a real hand photo to a running finger-detection engine and report what it sees. From
backend/: `.venv/bin/python -m level1.cv_check [URL]` (default http://localhost:8000; the VM: its
https URL). No camera needed, nothing is stored, no API credits. The photo is pointing_up.jpg from
MediaPipe's test assets (Apache 2.0).
"""

import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

import websockets

FIXTURE = Path(__file__).resolve().parent / "tests" / "fixtures" / "pointing_up.jpg"


def stream_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.startswith("https://"):
        return "wss://" + base.removeprefix("https://") + "/api/cv/stream"
    return "ws://" + base.removeprefix("http://") + "/api/cv/stream"


async def check(base_url: str, frames: int) -> int:
    photo = FIXTURE.read_bytes()
    started = time.perf_counter()
    try:
        async with websockets.connect(stream_url(base_url), max_size=2**20) as stream:
            ready = json.loads(await stream.recv())
            load_ms = (time.perf_counter() - started) * 1000
            print(f"engine ready in {load_ms:.0f} ms, box {ready['box']}")
            round_trips, engine_times, reply = [], [], {}
            for _ in range(frames):
                sent = time.perf_counter()
                await stream.send(photo)
                reply = json.loads(await stream.recv())
                if reply.get("type") != "frame":
                    print(f"engine error: {reply}")
                    return 1
                round_trips.append((time.perf_counter() - sent) * 1000)
                engine_times.append(reply["processingMs"])
    except websockets.exceptions.ConnectionClosed as closed:
        code, reason = (closed.rcvd.code, closed.rcvd.reason) if closed.rcvd else ("?", "")
        print(f"engine closed the stream: {code} {reason}")
        return 1
    except OSError as error:
        print(f"cannot reach {base_url}: {error}")
        return 1
    round_trip = statistics.median(round_trips)
    engine = statistics.median(engine_times)
    print(
        f"{frames} frames: tracking {reply['tracking']}, round trip median {round_trip:.1f} ms, "
        f"engine median {engine:.1f} ms"
    )
    return 0 if reply["tracking"] == "ok" else 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("url", nargs="?", default="http://localhost:8000")
    parser.add_argument("--frames", type=int, default=30)
    args = parser.parse_args(argv)
    return asyncio.run(check(args.url, args.frames))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
