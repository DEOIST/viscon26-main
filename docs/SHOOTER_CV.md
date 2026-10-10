# Finger-gun shooter: computer-vision design

This is the feature that wins or loses the demo. This document explains how we
make "shoot with your bare hand" feel precise, fast and reliable on a laptop
webcam in a noisy venue. Gameplay rules are in
[GAME_DESIGN.md](GAME_DESIGN.md#minigame-2-finger-gun-shooter-basisprüfung);
system context is in [ARCHITECTURE.md](ARCHITECTURE.md).

> **Status (2026-10-10): built (#13), as level 1.** The game lives in
> `frontend/level1/` (mounted by the outer shell through `src/games/registry.ts`)
> and its finger-detection engine in `backend/level1/` (registered in
> `app/routers/__init__.py`). The shooter scene (warm-up, countdown, 60-second
> round) is playable with the finger gun and with the mouse. Values marked "start value"
> are starting points to tune at the venue; values marked "measured" come from
> [Measurements](#measurements). [Not built yet](#not-built-yet) lists what is left.

## Acceptance criteria (measured on the demo setup)

Measure with the real demo setup: the demo laptop's camera and browser, and the
server the demo will use. CI has no camera; it only proves that the engine loads.

| What | Target |
|---|---|
| Intentional shots detected | ≥ 95 % (20 deliberate index recoils → at least 19 shots) |
| False shots | ≤ 1 per 30 s of aiming without shooting |
| Aim jitter at rest | crosshair moves < 1 % of the screen width while the hand is still |
| Input-to-feedback latency | < 150 ms from index flick to muzzle flash (film the screen and hand with a 240 fps phone video) |
| Engine rate | one answer per camera frame (~30 per second); `python -m level1.cv_check <server>` round trip ≤ 60 ms |
| Game frame rate | 60 fps on the demo laptop with the camera on |
| New player | understands the gesture within the 3 practice papers, without coaching |
| Recovery | camera denied or lost, engine busy, unavailable or idle → mouse mode within 2 s; the round continues |

## Why on the server (#13)

The team decided in issue #13 to run finger detection in the Python backend.
This replaces the earlier plan of MediaPipe in the browser
([DECISIONS.md](DECISIONS.md)). What we get:

- **One engine, tested in Python.** The gesture rules (`backend/level1/gesture.py`)
  are pure functions with pytest coverage, next to the MediaPipe wrapper
  (`backend/level1/cv.py`) and a test that runs the real model on a real photo.
- **A light browser.** The browser only captures the camera, encodes a small
  JPEG per frame and draws the game. No 12 MB wasm runtime to download, no hand
  model competing with Phaser for the GPU and the main thread.
- **No API credits.** MediaPipe runs locally on the server's CPU; CV never
  calls OpenAI.

What it costs, and how we contain it:

| Cost | Containment |
|---|---|
| Network latency on every frame | Exactly one frame in flight (`FramePacer`), 640 px JPEGs (46 KB measured), the answer ~1 KB. Run the server close to the player: the demo laptop's own `make prod` is best; check a VM with `python -m level1.cv_check <url>` |
| Server CPU: about one core per tracked player at 30 frames per second | `CV_MAX_SESSIONS` (default 4) caps it; further players get mouse mode (close code 1013). Streams that send nothing for `CV_IDLE_TIMEOUT_SECONDS` (default 20) are closed (4000), which frees the slot of a hidden tab |
| Upload bandwidth: about 11 Mbit/s per player (46 KB per 640 px frame from a real hand recording, 30 per second). 320 px frames would be a quarter of that, but made the aim shakier and fired false shots ([Camera](#camera-browser)) | Fine on a laptop next to its own server; on venue wifi to a VM, measure first |
| Camera frames reach our server | Decoded in memory, never stored or logged; only landmarks and the aim go back. The one exception is a developer's [recording](#recording-debugging-gestures), which only a server in development mode accepts |

We use MediaPipe's **HandLandmarker** and our own geometry, not its
GestureRecognizer: GestureRecognizer has no finger-gun gesture, adds a
classifier, and we need continuous fingertip positions anyway.

## Pipeline

```
Browser: frontend/level1/input/ServerHandInput.ts                     Server: one FastAPI process
getUserMedia 640×480 ~30 fps, never shown (the scene draws its own backdrop)
  │ requestVideoFrameCallback → FramePacer: one frame in flight, never the same frame twice
  ▼
640 px wide JPEG (quality 0.8) ── binary WebSocket message ──► /api/cv/stream   (backend/level1/router.py)
                                                                 │ decode_frame: Pillow, ≤ 1280×960
                                                                 ▼
                                                               HandLandmarker, VIDEO mode, CPU, ≤ 2 hands
                                                                 │ per hand: 21 image landmarks (0..1)
                                                                 ▼
                                                               PlayerGun        (backend/level1/gesture.py)
                                                                 ├ drop duplicate detections of one hand
                                                                 ├ GunTracks: one GunTracker per hand, stable
                                                                 │ across frames; the largest is the player
                                                                 ├ pose: ring and pinky curled?
                                                                 ├ aim: calibrated palm offset → One-Euro
                                                                 └ trigger: quick upward index recoil + return,
                                                                   cooldown, aim from before the flick
{type: "frame", tracking, aim, firedAt, landmarks, thumbAngle, processingMs} ◄── JSON
  ▼
SwitchableInput (camera, or the mouse as fallback) → ShooterScene (Phaser): crosshair,
hand skeleton, hit test at firedAt, effects
```

## Wire protocol

`GET /api/cv/status` → `CvStatus`: `{available, reason, activeSessions,
maxSessions}`. It starts a detector once per process to prove that MediaPipe,
its system libraries and the model all work (~2 s the first time; only success
is remembered, so a failed start is retried); calling it before a round also
warms the engine up, otherwise the first stream pays the ~2 s. In development the reason names the error (for
example a missing `.so` file); in production it points to the server log, which
has the full traceback (`make prod-logs`).

WebSocket `/api/cv/stream` (`backend/level1/router.py`, `input/cvStream.ts`):

| Direction | Message | Answer |
|---|---|---|
| server → client | `{"type": "ready", "box": [x0, y0, x1, y1]}` once the session's detector is loaded | |
| client → server | binary JPEG frame (JPEG only), at most `CV_MAX_FRAME_BYTES` (200 KB), each side ≤ 1280 px | `{"type": "frame", ...CvFrame}` |
| client → server | `{"type": "box", "box": [x0, y0, x1, y1]}` (`CvBoxMessage`): 0 ≤ x0 < x1 ≤ 1, same for y, each side at least 0.1 | `{"type": "ready", "box": [...]}` |
| client → server | `{"type": "settings", "cooldownMs": 175}` (`CvSettingsMessage`): 0–2000, the athlete perk | the same message |
| server → client | `{"type": "error", "detail": "..."}` for a bad frame or message; the stream continues | |

Control messages are validated by their schemas in `backend/level1/schemas.py` (JSON
numbers only: no booleans, NaN or infinity) and may be at most 1024 characters
long. Close codes: **1013** engine busy (all `CV_MAX_SESSIONS` slots taken),
**1011** engine unavailable (no model, or MediaPipe can't start), **4000** no
camera frames for `CV_IDLE_TIMEOUT_SECONDS` (control messages don't count). The
client turns every close into mouse mode with a readable reason (`closeMessage`).

```ts
// frontend/level1/input/cvStream.ts (mirrors backend/level1/schemas.py)
type Tracking = "ok" | "noPose" | "lost" | "calibrating";
type GamePoint = [number, number]; // game area 0..1, x already mirrored
interface CvFrame {
    type: "frame";
    tracking: Tracking;
    aim: GamePoint | null; // filtered: where the gun points
    firedAt: GamePoint | null; // set on confirmation, aim from before the flick
    landmarks: GamePoint[] | null; // 21 points for the skeleton (through the box), not clamped
    thumbAngle: number | null; // legacy thumb diagnostic; shooting uses recoil
    processingMs: number; // server time for this frame
}
```

## Camera (browser)

- `getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 },
  frameRate: { ideal: 30 }, facingMode: "user" }, audio: false })`, asked for
  right after the player clicks **Start**.
- The camera image is **never shown**: the video element is only a frame
  source, kept in the page at 1 px with opacity 0 (browsers may stop decoding a
  detached or `display: none` video, and `requestVideoFrameCallback` then never
  fires). The game shows its own backdrop instead (`Backdrop.ts`). The engine
  mirrors x, so moving your hand right moves the crosshair right.
- **Frames sent: 640 px wide, JPEG quality 0.8** (`FRAME_WIDTH`,
  `JPEG_QUALITY` in `config.ts`), the size the gesture thresholds were tuned
  on. Replaying the prototype's camera recordings through the engine at
  320 px / 0.7 made the aim 20–43 % shakier and, on the labeled recording, missed
  one shot and fired one false shot; at 640 px / 0.8 it caught every labeled
  shot with no false one (measured). The cost is upload bandwidth (46 KB per
  frame) and engine time (9.7 ms median per frame, natively).
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
  `num_hands=2` (the largest is the player), detection, presence and tracking
  confidence **0.3** (measured): MediaPipe's default 0.5 drops small,
  foreshortened gun hands (a fist pointing at the camera) and re-detects them,
  which loses frames and sometimes reports the hand twice. On a two-hand
  recording 0.3 cut frames missing a visible hand from 24 to 10, the longest gap
  from 5 frames to 1, and duplicates from 16 to 0, with no false hands on any
  recording (0.2 added one).
- **The model** (`hand_landmarker.task`, float16, 7.8 MB) is downloaded by the
  frontend build into the git-ignored `frontend/public/models/` (CI rejects
  files over 5 MB), copied to `dist/static/models/`, and read by the server from
  `CV_MODEL_PATH` (default: that file in `frontend/dist`, else the one in
  `frontend/public/models/`, so `make dev` works after one build). The Docker
  image gets the model through the frontend build stage.
- **System libraries.** In `python:3.12-slim` MediaPipe needs `libxcb1`,
  `libgl1`, `libglib2.0-0` (to import OpenCV) and `libegl1`, `libgles2` (when a
  detector starts), even though the server never opens a window; the x86_64
  and arm64 wheels need the same ones. Without them the engine reports itself
  unavailable and the log names the missing `.so` file. `MPLCONFIGDIR=/tmp/matplotlib`
  gives matplotlib (pulled in by MediaPipe) a writable cache, because `appuser`
  has no home directory.
- **Concurrency.** Decoding and detection run in the threadpool
  (`run_in_threadpool`), and MediaPipe releases the GIL, so players don't block
  each other or the rest of the API: four parallel players got the same median
  round trip as one (measured).
- **Limits** (the stream is open to anyone who can load the page):
  - frames: JPEG only (every other Pillow parser is attack surface),
    `CV_MAX_FRAME_BYTES`, and each side at most 1280 px and 1280×960 px in
    total, checked from the header before decoding. **A side of 32767 px or more
    aborts OpenCV inside MediaPipe, a native crash that kills the whole server
    process**, so the side limit is checked again right before the detector
    runs. Pillow's decompression-bomb guard maps to "Frame too large" too;
  - control messages: at most 1024 characters, because they are parsed on the
    event loop; every WebSocket message is capped at 1 MiB by uvicorn
    (`--ws-max-size` in the Dockerfile; keep it above `CV_MAX_FRAME_BYTES`);
  - `CV_MAX_SESSIONS` slots, freed after `CV_IDLE_TIMEOUT_SECONDS` without a
    camera frame. A slot is always returned, even if a detector fails to close.
- **Privacy.** Frames live only in memory while one is processed; nothing
  writes them to disk or to the log.

## Landmarks we use

```
 4 thumb tip              8 index tip   12      16 ring  20 pinky
 3                        7             11      15 tip   19 tip
 2 thumb MCP              6 index PIP   10      14 PIP   18 PIP
 1                        5 index MCP ─ 9 ───── 13 ──── 17
  \                                                     /
   └───────────────────────── 0 wrist ─────────────────┘
```

0 wrist · 1–4 thumb · 5–8 index · 9–12 middle · 13–16 ring · 17–20 pinky.

Everything uses the **image landmarks scaled to pixels** (x·W, y·H, z·W), so
angles don't depend on the camera's aspect ratio. MediaPipe's metric "world"
landmarks are not used: they are unreliable when the index finger points
straight at the camera, which is exactly how players aim.

The legacy thumb rules in `backend/level1/gesture.py` are tuned on four recordings of real play in
the game (`backend/level1/tests/fixtures/captures/play_*.jsonl`, every frame's
landmarks, with the frames where the thumb was visibly down labeled by eye) and
checked on photos (`backend/level1/tests/fixtures/aim*.jpg`, `shoot1.jpg`). `test_gesture.py`
replays the recordings with the explicit legacy thumb trigger: every labeled drop must fire,
nothing else may. `test_recoil.py` checks the live recoil trigger with synthetic motion and
replays those same recordings to ensure ordinary thumb drops do not produce recoil shots. Re-run
the tests whenever a threshold changes, and record new play (see
[Recording](#recording-debugging-gestures)) when players report misfires.

**Thumb/index swaps.** With the index pointing at the camera, MediaPipe often
mislabels the hand: it calls the upright thumb the index finger and lays the
thumb chain along the curled fingers. On the recordings that happened in about
15 % of the frames. Read naively it is a dropped thumb (a false shot), and the
index tip jumps onto the thumb (which threw the old aim around). The legacy thumb
trigger recognizes the static swap. Recoil instead checks temporal continuity of both fingers:
a real index lifting upright can look like a swapped thumb in a single frame. The aim uses no
thumb or index landmark.

## Picking the hand

MediaPipe returns up to two hands.

- **Duplicates:** at a low confidence MediaPipe sometimes reports one hand
  twice (its tracked hand plus a fresh detection). Two detections whose
  bounding boxes overlap by more than half of the smaller one
  (`DUPLICATE_OVERLAP`) are one hand; the larger is kept. Two hands held
  tightly together therefore count as one gun.
- **Tracks:** every distinct hand gets its own `GunTracker`, matched across
  frames by the nearest palm point (at most 0.2 frame widths per frame,
  closest pairs first), so a second hand can't disturb the player's aim or
  trigger.
- **The player** is the largest hand in the image (the one closest to the
  camera) when the crosshair is acquired, and stays that hand for as long as it
  is tracked. Someone walking behind cannot steal the crosshair, and their recoil
  can't fire. Choosing the largest hand on every frame made the crosshair jump
  between two hands of similar size: on a two-hand recording, jumps of more
  than 10 % of the screen in one frame fell from 50 to 12 with the sticky
  player (measured). While the player's hand is briefly out of view (≤ 300 ms)
  the frame is `lost` even if another hand is visible; after that, the largest
  visible hand becomes the player.

## Pose: is this a finger gun?

Ring and pinky curled: each finger's tip is closer to the wrist than its PIP
joint (`reach` < 1). Checked on every frame, no debounce.

- The index is not checked: pointing at the camera foreshortens it to a reach
  of ~1.05, the same as a curled finger, which blocked real shots.
- The middle finger is too ambiguous to use (0.76–1.17 on the samples).
- The thumb is not part of the pose or the recoil trigger; it can rest in any position.

The crosshair shows the state: gold when aiming; grey in the centre with "Hold
your finger gun still, pointing at the centre" while calibrating; grey with the
hint "Make a finger gun 👉" when a hand is visible but not in pose; hidden, with
"Show your hand to the camera", when no hand is visible.

## Aim

The crosshair follows the hand, like a mouse in the air, relative to where the
player held it when the aim was calibrated.

1. **Palm point:** the mean of the wrist (0) and the middle, ring and pinky
   knuckles (9, 13, 17): landmarks that a thumb/index swap never moves. On the
   recordings its frame-to-frame jitter is ~2 % of a player's aiming range.
   (The old aim, hand position plus the wrist→index-tip direction, jumped by
   more than 10 % of the screen in a single frame in 10–13 % of all frames,
   whenever the labels swapped. Players also aim by turning the fist rather
   than moving it, which moved the index knuckle only ~14 % of the frame
   width.) The wrist→knuckles direction is no alternative: with the index at
   the camera the wrist sits behind the knuckles and the direction spins.
2. **Calibration:** at the start of a stream the engine waits until the finger
   gun is held still (the palm within 0.02 frame widths for 15 frames, 0.5 s)
   and takes that palm position as the neutral point: the centre of the
   screen. The warm-up's first practice paper sits in the centre, so that is
   where players hold it. Meanwhile frames say `tracking: "calibrating"`, the
   crosshair waits grey in the centre, and no shot fires. **C** recalibrates
   (`{"type": "recenter"}`), e.g. when a new player takes over or the arm
   sank.
3. **Mapping:** the palm's offset from the neutral point, mirrored, times
   `AIM_GAIN` = 4 (moving the hand a quarter of the camera width sweeps the
   screen); the vertical offset is also scaled by the game area's 16:9 so both
   axes feel the same. Clamped to 0..1.
4. **One-Euro filter** per axis (Casiez et al., 2012): smooth when the hand is
   slow, responsive when it is fast. `min_cutoff = 0.5` Hz, `beta = 0.5`.
   `test_recorded_aim_is_smooth_and_never_jumps` measures the wobble (median
   0.0012 of the screen per frame² on the recordings) and the jumps.
5. The engine answers at camera rate (~30 Hz). **Glide (display only):** the
   scene draws the crosshair gliding toward each answer (`glide.ts`, time
   constant `CROSSHAIR_GLIDE_MS` = 40 ms) instead of stepping at 30 Hz. Shots
   still land at the engine's `firedAt`.

**The box** is a region of the mirrored camera image (default x 0.2–0.8,
y 0.15–0.75) that maps onto the game area for the hand skeleton: the engine
maps the landmarks through it. The browser fits the box to the camera's shape
(`input/box.ts`: same width and centre, the game area's 16:9 shape in camera
pixels; y 0.225–0.675 for a 4:3 camera) and sends it once as
`{"type": "box"}` before the first frame, so the skeleton isn't stretched. The
box does not change the aim.

## Trigger: upward index recoil

Aim with the hand, pause briefly, then flick the index upward and let it return, as if a gun
recoils. Thumb drops no longer fire in live camera sessions. The return is part of the gesture:
a fast upward movement that stays at the new position is an aim change, so speed alone is not
enough to shoot.

`backend/level1/recoil.py` holds the detector and its tunable thresholds. Distances use the
image-space middle-to-pinky knuckle span as a palm width; times use camera-frame timestamps.
The same gesture therefore works at different hand sizes, distances and frame rates.

1. **Settle:** the finger and palm stay within 0.10 and 0.18 palm widths for at least **120 ms**
   (at least three observations). This arms the gesture at the player's current finger angle.
2. **Rise:** the index tip rises relative to its own knuckle, at least **0.35 palm widths**, with
   an upward speed of at least **2.5 palm widths/s**, within **180 ms**. At least two rising
   observations are required, rejecting a single-frame landmark spike.
3. **Confirm the return:** within **350 ms** of the pre-flick observation, the index returns
   at least **35 %** of its peak lift (and at least 0.12 palm widths). This is when one shot fires;
   it does not wait for a complete return. A slow lift or a raised finger held in place does not
   fire. The partial return costs a few camera frames but distinguishes recoil from re-aiming.
4. **Re-arm:** the index returns within 0.10 palm widths of its starting position, then settles
   again. Staying raised or bouncing around the peak cannot produce repeated shots. If a player
   re-aims before returning fully, recovery expires after **450 ms** and a fresh settle at the
   new position can arm another gesture, avoiding a permanently disarmed gun.

During the pulse, sideways travel must stay below 65 % of the upward lift, and palm travel
below 0.60 palm widths. Whole-hand translation cancels out of the relative index measurement:
moving the hand up, sideways or diagonally changes the crosshair without firing. A recoil can
include a small wrist/palm movement. Large simultaneous thumb/index jumps discard the gesture
as a possible landmark swap; an index lifting upright with a continuous thumb remains valid.

- **Pose and tracking:** shots require the finger-gun pose. A missing hand frame, a gap longer
  than 120 ms, invalid geometry, calibration/recentering or a change of player discards any
  pending recoil. Tracking may retain the crosshair for 300 ms, but recovery never completes
  an old shot.
- **Cooldown:** at least **250 ms** between accepted shots; the ASVZ-athlete perk sends
  `{"type": "settings", "cooldownMs": 175}`. A suppressed pulse is consumed, not queued.
- **Shot aim:** the shot lands at the last filtered aim **before the flick starts**. The live
  crosshair continues following the palm, so the recoil cannot drag the shot off the target.
- **Protocol:** unchanged. `firedAt` carries the shot point; `thumbAngle` remains a legacy debug
  measurement. Recordings also include `recoil_phase`, `recoil_lift` (palm widths), `shot_time`
  (pre-flick timestamp in seconds), and `cocked` (whether recoil is armed).

**Playtesting:** these thresholds are starting values, validated with synthetic gestures at
15, 24, 30 and 60 fps and with the old recordings as negative examples. The existing camera
recordings contain thumb drops, not labeled intentional recoil gestures. Use **R** to record
several players aiming normally and shooting, label their recoils, and check the acceptance
criteria above before claiming a measured detection rate. A quick wrist tilt up and back with
a mostly stationary palm is recognized; a pure upward translation of the entire hand is aiming.

### Legacy thumb trigger (recording regressions only)

`PlayerGun(trigger="thumb")` explicitly enables the old trigger from Python, keeping the
four labeled recordings and photo assertions intact. Live WebSocket sessions always use the
default recoil mode; there is no browser setting for the old trigger.

The old thumb detector learns upright thumb length in knuckle spans. It arms below 32 degrees
and above 80 % upright length, then fires above 55 degrees or below 70 % length for two frames.
It uses a fixed 0.2-second aim look-back. Those measurements and their original regression tests
remain in `gesture.py`; they are not evidence that recoil works for every player.

## Tracking loss and recovery

| Situation | Behavior |
|---|---|
| Hand out of view ≤ 300 ms | The last aim stays (grey); the hand keeps its track, but pending recoil is discarded and must settle again |
| Hand out of view > 300 ms | Crosshair hidden, "Show your hand to the camera"; the hand comes back as a new track and must settle before shooting |
| Camera denied, busy or missing; page not on `https://` or `localhost` | Mouse mode with the reason, the round continues; the shell shows the reason |
| Camera unplugged or its permission revoked mid-round | Mouse mode at once (the track's `ended` event) |
| Engine busy (1013), unavailable (1011) or the connection lost | Mouse mode with the reason |
| No frames for 20 s, e.g. a hidden tab (4000) | The server frees the slot; the client switches to mouse mode |
| Operator presses `M` | Mouse mode for the rest of the round |
| Player or operator presses `C` | The aim calibrates again: hold the finger gun still at the centre |

## Recording (debugging gestures)

To find out why a shot fired or the aim shook, record what the engine saw: run
the server in development (`make dev`), play the shooter, press **R** to start
and **R** again to stop. The HUD shows `● REC`. The browser sends
`{"type": "record", "on": true}` (`CvRecordMessage`); the engine answers
`{"type": "record", "on": true, "dir": "<folder>"}` and the browser console
prints the folder. Leaving the page also ends the recording.

The engine saves into `backend/captures/<timestamp>/` (git-ignored, not in the
Docker image):

- `00000.jpg`, `00001.jpg`, ...: each frame exactly as received;
- `frames.jsonl`, one line per frame: `size`, `t_ms`, the `reply` the browser
  got (`tracking`, `aim`, `fired_at`, `processing_ms`), every distinct hand
  (`id`, `player`, `shot`, `gun`, `hammer_angle` (legacy thumb diagnostic),
  `thumb_angle` (as labeled), `thumb_length` (fraction of the learned upright
  length), `swapped`, `cocked`, `palm`, `reach` of index,
  ring and pinky, `recoil_phase`, `recoil_lift`, `shot_time`, the 21 `landmarks`),
  and the `duplicates` that were dropped. `swapped` is the legacy static heuristic;
  a real upright index recoil can also match it.

The landmarks make a recording replayable through `PlayerGun` without the
model, the way `test_gesture.py` replays `backend/level1/tests/fixtures/captures/play_*.jsonl`
(made from four such recordings, landmarks only);
the JPEGs allow running the model again, e.g. at another frame size.

**Only a server in development mode records** (`ENVIRONMENT=development`, the
default of `make dev`). Anyone can open the stream, and a production server
must never store camera frames, so `make prod` and the VM answer
`{"type": "record", "on": false, "dir": null}` and save nothing.

## Input abstraction

```ts
// frontend/src/frontend/level1/input/InputSource.ts
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
- **Backdrop** (`Backdrop.ts`) instead of the webcam image: a near-black
  exam-hall corridor. Floor and ceiling grids scroll toward the player, dust
  streams out of the vanishing point, and the horizon glows. Every shot sends
  a shockwave through it and flashes the glow (gold on a hit, red on a miss,
  white when the round starts); a hit streak warms the colours from cold blue
  to magenta, shots speed up the scroll, and the last 10 seconds pulse red. One
  `Graphics` object redrawn each frame with plain shapes: no shaders or
  gradients, so it runs on Canvas too, and no sprites against the budget.
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
measure it with `python -m level1.cv_check <url>`.

| What | Native | Production image |
|---|---|---|
| Engine time per 320 px frame (median) | 8.9 ms | 19.3 ms |
| Engine time per 640 px frame of a real hand (median / p95), 2026-10-10 after the switch to 640 px | 9.7 / 12.9 ms | not measured |
| `level1.cv_check` round trip on localhost (median) | 10.7 ms | 26.1 ms |
| Four players at once, round trip each (median / p95) | | 26 / ≤ 32 ms |
| First detector in a process (cold start) | ~1.8 s | |
| Stream ready once warm (connect + detector start) | 185 ms | 45 ms |
| Browser: engine answers per second (30 fps camera) | | 30.1 |
| Browser: JPEG per frame / JSON answer | | 9.3 KB / ~1 KB (320 px); 46 KB per 640 px frame of a real hand |

The browser rate was 17 per second before `FramePacer` sent a waiting frame as
soon as an answer arrived; now the camera is the limit.

## Testing without a camera (and without credits)

- **pytest** (`make check`): `test_gesture.py` (synthetic hands from
  `backend/level1/tests/hands.py` for pose, aim, calibration, tracks, duplicates, both drop
  styles, label swaps, cooldown and look-back in explicit legacy thumb mode, plus four replayed
  recordings of play that must fire exactly the labeled thumb shots with a smooth aim),
  `test_recoil.py` (recoil versus ordinary aim, slow/one-way movements, jitter and swaps,
  hand sizes, 15–60 fps, return/re-arm, loss, recenter and pre-flick aim; old recordings must
  not fire recoil shots),
  `test_cv.py` (the HTTP and WebSocket contract with a scripted detector:
  frames, errors, limits, busy, unavailable, idle, settings, recording and its
  refusal in production),
  `test_cv_mediapipe.py` (the real model through the stream on
  `backend/level1/tests/fixtures/`: the aim photos read as cocked guns, the aim follows the
  finger, aim → thumb drop fires one shot in explicit legacy mode; skipped when the model hasn't been
  downloaded).
- **vitest** (`make check`): `depth`, `hitTest`, `score`, `spawn`, `box`,
  `cvStream`, `FramePacer`, `glide`, the backdrop's colours, and `SwitchableInput.test.ts`, which runs the whole
  input lifecycle against a fake browser (camera, video, WebSocket): fallback
  on an insecure origin, an unplugged camera or a busy engine, the box
  handshake, `M`, and destroy during start-up.
- **`.venv/bin/python -m level1.cv_check [URL]`** (from `backend/`) streams the photo to a running server
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
  localhost), and `python -m level1.cv_check <that url>` must show a round trip well
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

- **Per-player box calibration.** The warm-up teaches the gesture; the box is
  the default one, fitted to the camera's shape. The protocol is ready
  (`{"type": "box"}`).
- A tool that replays a recording (`backend/captures/...`) and reports shots
  and wobble, and a debug overlay with the thumb angle (the HUD shows the round
  trip only).
- Pausing the round on a hidden tab, a WebGL context-loss screen, sound,
  hit-stop, isometric art in a texture atlas instead of shapes.

## Who owns what

| Owner | Files |
|---|---|
| Shooter vision (engine) | `backend/level1/`: `gesture.py`, `cv.py`, `router.py`, `schemas.py`, `config.py`, `cv_check.py`, `tests/`; the Dockerfile's system libraries |
| Shooter vision (client) | `frontend/level1/input/*` (`ServerHandInput`, `FramePacer`, `box.ts`, `SwitchableInput`, `MouseInput`, `cvStream.ts`) |
| Shooter game | `frontend/level1/`: `index.ts` (`mountShooter`), `ShooterScene.ts`, `Backdrop.ts`, `depth.ts`, `hitTest.ts`, `score.ts`, `spawn.ts`, `glide.ts`, `effects.ts`, `handOverlay.ts`, `config.ts` |
| Shell (from main) | `src/minigames/DestinationGame.tsx` mounts the game into the play area via `src/games/registry.ts`; intro, results and credit are the shell's |
