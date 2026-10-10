# Finger-gun shooter: computer-vision design

This is the feature that wins or loses the demo. This document explains how we
make "shoot with your bare hand" feel precise, fast and reliable on a laptop
webcam in a noisy venue. Gameplay rules are in
[GAME_DESIGN.md](GAME_DESIGN.md#minigame-2-finger-gun-shooter-basisprüfung);
system context is in [ARCHITECTURE.md](ARCHITECTURE.md).

> **Status (2026-10-10): built (#13).** The finger-detection engine runs in the
> Python backend; the shooter scene (warm-up, countdown, 60-second round) is
> playable with the finger gun and with the mouse. Values marked "start value"
> are starting points to tune at the venue; values marked "measured" come from
> [Measurements](#measurements). [Not built yet](#not-built-yet) lists what is left.

## Acceptance criteria (measured on the demo setup)

Measure with the real demo setup: the demo laptop's camera and browser, and the
server the demo will use. CI has no camera; it only proves that the engine loads.

| What | Target |
|---|---|
| Intentional shots detected | ≥ 95 % (20 deliberate thumb drops → at least 19 shots) |
| False shots | ≤ 1 per 30 s of aiming without shooting |
| Aim jitter at rest | crosshair moves < 1 % of the screen width while the hand is still |
| Input-to-feedback latency | < 150 ms from thumb drop to muzzle flash (film the screen and hand with a 240 fps phone video) |
| Engine rate | one answer per camera frame (~30 per second); `make cv-check URL=<server>` round trip ≤ 60 ms |
| Game frame rate | 60 fps on the demo laptop with the camera on |
| New player | understands the gesture within the 3 practice papers, without coaching |
| Recovery | camera denied or lost, engine busy, unavailable or idle → mouse mode within 2 s; the round continues |

## Why on the server (#13)

The team decided in issue #13 to run finger detection in the Python backend.
This replaces the earlier plan of MediaPipe in the browser
([DECISIONS.md](DECISIONS.md)). What we get:

- **One engine, tested in Python.** The gesture rules (`services/gesture.py`)
  are pure functions with pytest coverage, next to the MediaPipe wrapper
  (`services/cv.py`) and a test that runs the real model on a real photo.
- **A light browser.** The browser only captures the camera, encodes a small
  JPEG per frame and draws the game. No 12 MB wasm runtime to download, no hand
  model competing with Phaser for the GPU and the main thread.
- **No API credits.** MediaPipe runs locally on the server's CPU; CV never
  calls OpenAI.

What it costs, and how we contain it:

| Cost | Containment |
|---|---|
| Network latency on every frame | Exactly one frame in flight (`FramePacer`), 320 px JPEGs (9.3 KB measured), the answer ~1 KB. Run the server close to the player: the demo laptop's own `make prod` is best; check a VM with `make cv-check URL=...` |
| Server CPU: about one core per tracked player at 30 frames per second | `CV_MAX_SESSIONS` (default 4) caps it; further players get mouse mode (close code 1013). Streams that send nothing for `CV_IDLE_TIMEOUT_SECONDS` (default 20) are closed (4000), which frees the slot of a hidden tab |
| Upload bandwidth: about 2–4 Mbit/s per player (estimate: 9.3 KB per frame from a still photo, more from a noisy real camera) | Fine on a laptop next to its own server; on venue wifi to a VM, measure first |
| Camera frames reach our server | Decoded in memory, never stored or logged; only landmarks and the aim go back. The shooter intro screen says so |

We use MediaPipe's **HandLandmarker** and our own geometry, not its
GestureRecognizer: GestureRecognizer has no finger-gun gesture, adds a
classifier, and we need continuous fingertip positions anyway.

## Pipeline

```
Browser: input/ServerHandInput.ts                     Server: one FastAPI process
getUserMedia 640×480 ~30 fps, shown mirrored behind the transparent Phaser canvas
  │ requestVideoFrameCallback → FramePacer: one frame in flight, never the same frame twice
  ▼
320 px wide JPEG (quality 0.7) ── binary WebSocket message ──► /api/cv/stream   (routers/cv.py)
                                                                 │ decode_frame: Pillow, ≤ 1280×960
                                                                 ▼
                                                               HandLandmarker, VIDEO mode, CPU
                                                                 │ per hand: 21 image landmarks (0..1)
                                                                 │ + 21 world landmarks (metres)
                                                                 ▼
                                                               pick_hand: the largest hand
                                                                 ▼
                                                               GestureTracker   (services/gesture.py)
                                                                 ├ pose: is it a finger gun?
                                                                 ├ aim: fingertip → box → game area → One-Euro
                                                                 └ trigger: thumb drop, hysteresis, cooldown,
                                                                   aim from ~100 ms earlier
{type: "frame", tracking, aim, firedAt, landmarks, thumbDistance, processingMs} ◄── JSON
  ▼
SwitchableInput (camera, or the mouse as fallback) → ShooterScene (Phaser): crosshair,
hand skeleton, hit test at firedAt, effects
```

## Wire protocol

`GET /api/cv/status` → `CvStatus`: `{available, reason, activeSessions,
maxSessions}`. It starts a detector once per process to prove that MediaPipe,
its system libraries and the model all work (~2 s the first time; only success
is remembered, so a failed start is retried). The shooter intro screen calls it,
which also warms the engine up.

WebSocket `/api/cv/stream` (`routers/cv.py`, `input/cvStream.ts`):

| Direction | Message | Answer |
|---|---|---|
| server → client | `{"type": "ready", "box": [x0, y0, x1, y1]}` once the session's detector is loaded | |
| client → server | binary JPEG frame, at most `CV_MAX_FRAME_BYTES` (200 KB) | `{"type": "frame", ...CvFrame}` |
| client → server | `{"type": "box", "box": [x0, y0, x1, y1]}`, 0 ≤ x0 < x1 ≤ 1, same for y | `{"type": "ready", "box": [...]}` |
| client → server | `{"type": "settings", "cooldownMs": 175}`, 0–2000 (the athlete perk) | the same message |
| server → client | `{"type": "error", "detail": "..."}` for a bad frame or message; the stream continues | |

Close codes: **1013** engine busy (all `CV_MAX_SESSIONS` slots taken), **1011**
engine unavailable (no model, or MediaPipe can't start; the reason says which),
**4000** no frames for `CV_IDLE_TIMEOUT_SECONDS`. The client turns every close
into mouse mode with a readable reason (`closeMessage`).

```ts
// frontend/src/misc/CommonInt.ts (mirrors backend/app/schemas.py)
type Tracking = "ok" | "noPose" | "lost";
type GamePoint = [number, number]; // game area 0..1, x already mirrored
interface CvFrame {
    type: "frame";
    tracking: Tracking;
    aim: GamePoint | null; // filtered fingertip
    firedAt: GamePoint | null; // set on the frame a shot fires (look-back applied)
    landmarks: GamePoint[] | null; // 21 points for the skeleton, not clamped
    thumbDistance: number | null; // metres, for tuning
    processingMs: number; // server time for this frame
}
```

## Camera (browser)

- `getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 },
  frameRate: { ideal: 30 }, facingMode: "user" }, audio: false })`, asked for
  right after the player clicks **Start**.
- The video is shown **mirrored** (`transform: scaleX(-1)`) behind the
  transparent Phaser canvas, so moving your hand right moves it right on
  screen. The engine mirrors landmark x the same way.
- `NotAllowedError` (denied), `NotFoundError` (no camera) and
  `NotReadableError` (in use by another app) switch to mouse mode with that
  reason (`cameraErrorMessage`).
- **Secure context required:** `getUserMedia` only exists on `https://` origins
  and on `http://localhost`. See [Demo setup](#demo-setup-checklist).
- `destroy()` closes the WebSocket and stops every camera track. Leaving the
  page releases both anyway, because every scene is its own page.

## The engine (server)

- **One HandLandmarker per WebSocket**: VIDEO mode needs strictly increasing
  timestamps per instance, which `CvSession` derives from a monotonic clock.
  `num_hands=2` (we keep the closest), detection and presence confidence 0.6,
  tracking confidence 0.5 (start values).
- **The model** (`hand_landmarker.task`, float16, 7.8 MB) is downloaded by the
  frontend build into the git-ignored `frontend/public/models/` (CI rejects
  files over 5 MB), copied to `dist/static/models/`, and read by the server from
  `CV_MODEL_PATH` (default: that file in `frontend/dist`). The Docker image
  gets it through the frontend build stage.
- **System libraries.** In `python:3.14-slim` MediaPipe needs `libxcb1`,
  `libgl1`, `libglib2.0-0` (to import OpenCV) and `libegl1`, `libgles2` (when a
  detector starts), even though the server never opens a window. Without them
  `/api/cv/status` reports the missing `.so` file. `MPLCONFIGDIR=/tmp/matplotlib`
  gives matplotlib (pulled in by MediaPipe) a writable cache, because `appuser`
  has no home directory.
- **Concurrency.** Decoding and detection run in the threadpool
  (`run_in_threadpool`), and MediaPipe releases the GIL, so players don't block
  each other or the rest of the API: four parallel players got the same median
  round trip as one (measured).
- **Limits.** `CV_MAX_FRAME_BYTES` per message, `MAX_FRAME_PIXELS` (1280×960)
  checked from the image header before decoding, Pillow's decompression-bomb
  guard mapped to "Frame too large", `CV_MAX_SESSIONS`, `CV_IDLE_TIMEOUT_SECONDS`.
- **Privacy.** Frames live only in memory while one is processed; nothing
  writes them to disk or to the log.

## Landmarks we use

```
 4 thumb tip              8 index tip   12      16      20
 3                        7             11      15      19
 2                        6 index PIP   10      14      18
 1                        5 index MCP ─ 9 ───── 13 ──── 17
  \                                                     /
   └───────────────────────── 0 wrist ─────────────────┘
```

0 wrist · 1–4 thumb · 5–8 index · 9–12 middle · 13–16 ring · 17–20 pinky.

- **World landmarks (metres)** for pose and trigger: they don't change with the
  hand's distance to the camera.
- **Image landmarks** for aim and for drawing: they are screen positions.

## Picking the hand

MediaPipe returns up to two hands; `pick_hand` keeps the one with the largest
wrist-to-middle-MCP distance in the image, i.e. the one closest to the camera.
Someone walking behind the player cannot steal the crosshair.

## Pose: is this a finger gun?

The angle at each finger's PIP joint, between PIP→MCP and PIP→tip (world
landmarks): about 180° is straight.

- Index straight: PIP angle > **140°** (start value; MediaPipe's own
  `pointing_up.jpg` measures 154°).
- Middle, ring, pinky curled: PIP angle < **120°** (start value); at least 2 of
  the 3 must be curled. (A "victory" sign passes too: that is by design, the
  thumb trigger still decides.)
- The thumb is not part of the pose; it is the trigger.
- Debounce: the pose becomes valid after **3** consecutive frames and invalid
  after **5**.

The crosshair shows the state: gold when aiming; grey with the hint "Make a
finger gun 👉" when a hand is visible but not in pose; hidden, with "Show your
hand to the camera", when no hand is visible.

## Aim

1. Raw point = index fingertip (landmark 8), x mirrored. The fingertip is far
   steadier than extrapolating where the finger points.
2. **Box:** a comfortable region of the camera image (default x 0.2–0.8,
   y 0.15–0.75, in mirrored coordinates) maps to the whole game area, so small
   hand movements cover the screen and the player never reaches the image
   edges, where tracking degrades.
3. **Same box for the video:** `ServerHandInput.placeVideo` scales and positions
   the mirrored video so that the box fills the game area. The crosshair then
   sits exactly on the on-screen fingertip (verified: the skeleton overlays the
   hand in the video), while movements stay small.
4. Clamp to 0..1, then a **One-Euro filter** per axis (Casiez et al., 2012):
   smooth when the hand is slow, responsive when it is fast. Start values:
   `min_cutoff = 1.2`, `beta = 0.02`, `d_cutoff = 1.0`.
5. The engine answers at camera rate (~30 Hz); the scene draws the latest aim
   at 60 fps without easing.

The box can be changed per stream (`{"type": "box"}`), but nothing does that
yet: see [Not built yet](#not-built-yet).

## Trigger: the thumb hammer

The thumb starts up (cocked) and drops onto the side of the index finger to fire.

- **Signal:** `t = distance(thumb tip 4, index MCP 5)` in world metres.
- **Hysteresis:** the gun is *cocked* when `t > 0.055 m`; it fires on dropping
  below `0.035 m`, and must be cocked again before the next shot (start values).
  Two thresholds stop flicker around one threshold from producing double shots.
- **Cooldown:** at least **250 ms** between shots; the ASVZ-athlete perk sends
  `{"type": "settings", "cooldownMs": 175}` (30 % shorter).
- **Aim look-back:** dropping the thumb jerks the hand, so the shot is resolved
  at the filtered aim from about **100 ms before** it fired (from a 500 ms
  history). This one trick removes most of the "but I was on target!" frustration.
- Shots only fire while the pose is valid.
- Every threshold lives in `GestureConfig` (`services/gesture.py`); the
  gameplay values (round length, points, perks) live in
  `games/shooter/config.ts`.

**Plan B: pinch.** If the thumb hammer tests badly, fire on thumb tip (4) to
index tip (8) distance instead. Same pipeline, same hysteresis; only
`thumb_distance` changes.

## Tracking loss and recovery

| Situation | Behavior |
|---|---|
| Hand out of view ≤ 300 ms | The last aim stays (grey); pose and trigger reset, so no shot fires on the way back |
| Hand out of view > 300 ms | Crosshair hidden, "Show your hand to the camera" |
| Camera denied, busy or missing | Mouse mode with the reason, the round continues |
| Engine busy (1013), unavailable (1011) or the connection lost | Mouse mode with the reason |
| No frames for 20 s, e.g. a hidden tab (4000) | The server frees the slot; the client switches to mouse mode |
| Operator presses `M` | Mouse mode for the rest of the round |

Tuning note: if playtests show shots lost because the hand blurs out of
tracking for a frame exactly at the thumb drop, keep the pose and trigger state
through the 300 ms grace instead of resetting them.

## Input abstraction

```ts
// frontend/src/games/shooter/input/InputSource.ts
export interface InputSource {
    readonly mode: "camera" | "mouse";
    readonly aim: AimPoint | null; // game area 0..1
    readonly tracking: Tracking;
    readonly landmarks: AimPoint[] | null; // 21 points (camera only), for the skeleton
    takeShots(): AimPoint[]; // shots since the last call; the scene polls every frame
    destroy(): void;
}
```

| Implementation | Purpose |
|---|---|
| `ServerHandInput` | Camera + WebSocket to the engine. The real thing |
| `MouseInput` | Pointer position + click. Always available; the fallback and the operator override |
| `SwitchableInput` | What the scene holds: starts with `ServerHandInput` and swaps in `MouseInput` on any failure or on `M` |

`ShooterScene` never knows which source drives it.

## Fake depth with Phaser (what makes it feel like magic)

The shooter is a Phaser 4 scene with a **fixed view**: the player stays put and
the targets come to them, so there are no camera controls to build, and it runs
on the same engine and conventions as blackjack.

- **Depth** (`depth.ts`, pure, unit-tested): every target has a distance
  `z` (1 = the far end of the exam hall, 0 = in your face). `project()` turns
  lane, height and `z` into screen position, scale, draw order and haze, with
  perspective that accelerates as the target approaches.
- **Targets** fly along lanes that fan out from the horizon: exam questions
  (the text comes from the dialogue pack's `questions` event, or built-in
  lines), deadlines (fast, more points) and coffee (+3 s). A target that
  reaches the player leaves without a penalty; only missed shots cost points.
- **Hit test** (`hitTest.ts`, pure, unit-tested): at `firedAt`, the nearest
  target under the aim wins, against a circle of `radius × scale`.
- **Webcam background:** the mirrored `<video>` behind the transparent canvas
  (`transparent: true`), with a dark wash and a CSS filter so it looks designed
  rather than like a video call.
- **Feel** (`effects.ts`): muzzle flash at the aim, paper that shatters into
  pieces, a small camera shake on hits, floating "+10", streak bonuses, proctor
  subtitles from the dialogue pack.
- **Crosshair and neon hand skeleton** (`handOverlay.ts`), drawn every frame on
  top. The skeleton proves to the judges at a glance that the hand is really
  tracked.
- **Warm-up:** three practice papers (centre, top-left, bottom-right) teach the
  gesture before anything counts; `Enter` skips them, and they end by
  themselves after 25 s. They also hide the engine's start-up.

## Measurements

Measured on 2026-10-10 on an Apple M4 laptop: natively, and in the production
image (linux/arm64 in Docker Desktop, CPU only), with `pointing_up.jpg` and a
browser whose camera was replaced by that photo. A cloud VM will differ:
measure it with `make cv-check URL=...`.

| What | Native | Production image |
|---|---|---|
| Engine time per 320 px frame (median) | 8.9 ms | 19.3 ms |
| `make cv-check` round trip on localhost (median) | 10.7 ms | 26.1 ms |
| Four players at once, round trip each (median / p95) | | 26 / ≤ 32 ms |
| First detector in a process (cold start) | ~1.8 s | |
| Stream ready once warm (connect + detector start) | 185 ms | 45 ms |
| Browser: engine answers per second (30 fps camera) | | 30.1 |
| Browser: JPEG per frame / JSON answer | | 9.3 KB / ~1 KB |

The browser rate was 17 per second before `FramePacer` sent a waiting frame as
soon as an answer arrived; now the camera is the limit.

## Testing without a camera (and without credits)

- **pytest** (`make check`): `test_gesture.py` (synthetic hands from
  `tests/hands.py` for pose, aim, filter, trigger, cooldown and look-back),
  `test_cv.py` (the HTTP and WebSocket contract with a scripted detector:
  frames, errors, limits, busy, unavailable, idle, settings),
  `test_cv_mediapipe.py` (the real model on `tests/fixtures/pointing_up.jpg`,
  a MediaPipe test image, Apache-2.0; skipped when the model hasn't been
  downloaded).
- **vitest** (`make check`): `depth`, `hitTest`, `score`, `cvStream`,
  `FramePacer`.
- **`make cv-check [URL=https://host]`** streams the photo to a running server
  and prints the engine time and round trip. Use it on the VM before the demo.
- **The browser without a camera:** replace `navigator.mediaDevices.getUserMedia`
  before the page loads (Playwright `page.addInitScript`) with a function that
  draws a hand photo into a canvas every animation frame and returns
  `canvas.captureStream(30)`. The whole pipeline then runs for real: tracking
  `ok`, the skeleton on the hand, the latency in the HUD. A still photo never
  fires; shots are covered by pytest.
- CV never spends API credits, and CI needs no camera.

## Demo setup checklist

- [ ] **Where the engine runs.** Best: the demo laptop runs `make prod` and
  opens `http://localhost:8000` (localhost is a secure origin, and the network
  is out of the loop). With the VM: its `https://` URL (or an SSH tunnel to
  localhost), and `make cv-check URL=<that url>` must show a round trip well
  under 60 ms from the venue.
- [ ] `curl <url>/api/cv/status` says `"available": true`.
- [ ] Light from the front (face the window or a lamp, never sit with a window
  behind you). Test the exact demo spot at the venue by T+12h.
- [ ] Camera at about eye level; hand 40–80 cm from it; a plain background if possible.
- [ ] Close video-call apps; they can lock the camera.
- [ ] Recent Chrome or Edge.
- [ ] Mouse fallback ready (`M`); a recorded video of a perfect run as the last resort.
- [ ] Judges playing on their own devices at the same time share
  `CV_MAX_SESSIONS` camera slots on the server; the rest get mouse mode.

## Not built yet

- **Per-player box calibration.** The warm-up teaches the gesture but keeps the
  default box. With the AR overlay the default box already puts the crosshair on
  the fingertip; calibrate only if playtests show players at unusual distances
  or positions struggling. The protocol is ready (`{"type": "box"}`).
- Recording and replaying landmark streams (`?record=1`, a `ReplayInput`), and
  a debug overlay with joint angles and the thumb distance (the HUD shows the
  round trip only).
- Pausing the round on a hidden tab, a WebGL context-loss screen, sound,
  hit-stop, isometric art in a texture atlas instead of shapes.

## Who owns what

| Owner | Files |
|---|---|
| Shooter vision (engine) | `backend/app/services/gesture.py`, `services/cv.py`, `routers/cv.py`, their tests, `backend/tools/cv_check.py`, the Dockerfile's system libraries |
| Shooter vision (client) | `games/shooter/input/*` (`ServerHandInput`, `FramePacer`, `SwitchableInput`, `MouseInput`, `cvStream.ts`) |
| Shooter game | `games/shooter/ShooterScene.ts`, `depth.ts`, `hitTest.ts`, `score.ts`, `effects.ts`, `handOverlay.ts`, `config.ts` |
| Shell | `components/shooter/App.tsx`, `CvStatusNote.tsx`: intro, engine status, result and saving the score (`MinigamePage`) |
