# Finger-gun shooter: computer-vision design

This is the feature that wins or loses the demo. This document explains how we
make "shoot with your bare hand" feel precise, fast and reliable on a laptop
webcam in a noisy venue. Gameplay rules are in
[GAME_DESIGN.md](GAME_DESIGN.md#minigame-2-finger-gun-shooter-basisprüfung);
system context is in [ARCHITECTURE.md](ARCHITECTURE.md).

> Status: design, not built yet. Numbers marked "start value" are starting
> points to tune with the debug overlay, not measurements.

## Acceptance criteria (measured on the demo laptop)

Measure with the game scene and the camera running together, on the demo laptop
and on the weakest team laptop. Never measure on the VM or in CI: neither has a
GPU, so the numbers would describe software rendering, not our game.

| What | Target |
|---|---|
| Intentional shots detected | ≥ 95 % (20 deliberate thumb drops → at least 19 shots) |
| False shots | ≤ 1 per 30 s of aiming without shooting |
| Aim jitter at rest | crosshair moves < 1 % of the screen width while the hand is still |
| Input-to-feedback latency | < 150 ms from thumb drop to muzzle flash (film the screen and hand with a 240 fps phone video) |
| Frame rate with CV running | ≥ 95 % of frames ≤ 33 ms; target 60 fps |
| New player | understands the gesture within the 3 calibration targets, without coaching |
| Recovery | camera denied, lost or model missing → mouse mode within 2 s; the round continues |

**Gate at T+6h:** a throwaway spike page shows the crosshair following the index
finger and firing on a thumb drop, roughly meeting the first three rows. If it
doesn't, switch the trigger to a pinch (see "Trigger") before the game depends
on it. The spike is not merged; it only answers "does this work on our laptops".

## Why in the browser, never on the server

Camera frames never leave the laptop. MediaPipe runs the hand model on the GPU
in the browser at camera rate. Streaming 30 frames per second to FastAPI for
OpenCV would add network latency to every shot, need real server CPU, and send
faces over the network. CV also costs no API credits.

We use the **HandLandmarker** task and our own geometry, not MediaPipe's
GestureRecognizer: GestureRecognizer has no finger-gun gesture, adds a
classifier, and we need continuous fingertip positions anyway.

## Pipeline

```
webcam: getUserMedia, 640×480, ~30 fps, shown mirrored
  │  requestVideoFrameCallback: once per new camera frame
  ▼
HandLandmarker.detectForVideo(video, timestamp)      @mediapipe/tasks-vision, GPU delegate
  │  per hand: 21 image landmarks (0..1) + 21 world landmarks (metres) + handedness
  ▼
pick the hand: largest hand in view                   ignores people walking behind the player
  ▼
gesture.ts (pure functions, unit-tested)
  ├─ pose:    is it a finger gun? (index straight, ≥ 2 of middle/ring/pinky curled)
  ├─ aim:     index fingertip → calibration box → game area 0..1 → One-Euro filter
  └─ trigger: thumb-to-index distance (metres), hysteresis + cooldown
  ▼
InputSource { aim, tracking, onFire }                 same interface as MouseInput and ReplayInput
  ▼
ShooterScene (Phaser, isometric 2D): crosshair, hit test at the aim from ~100 ms before the trigger, effects
```

## Camera

- `navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480,
  frameRate: { ideal: 30 }, facingMode: "user" }, audio: false })`. 640×480 is
  plenty: the palm detector downscales anyway, and bigger frames only cost upload time.
- Show the video **mirrored** (`transform: scaleX(-1)`) so moving your hand
  right moves it right on screen, and mirror landmark x the same way (`x = 1 − x`).
- Ask for the camera only after a click on the shooter intro screen ("Enable
  camera") and say why. Handle `NotAllowedError` (denied), `NotFoundError` (no
  camera) and `NotReadableError` (camera busy, e.g. a video call) by switching to
  mouse mode with a friendly message.
- **Secure context required:** `getUserMedia` only exists on `https://` origins
  and on `http://localhost`. See "Demo setup".
- `destroy()` stops every track (`stream.getTracks().forEach((t) => t.stop())`)
  and calls `landmarker.close()`. Leaving the page also releases both, because
  every scene is its own page.

## MediaPipe setup

```ts
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks("/static/mediapipe"); // self-hosted wasm
const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
        modelAssetPath: "/static/models/hand_landmarker.task", // self-hosted, 7.8 MB
        delegate: "GPU", // if creation throws, retry with "CPU"
    },
    runningMode: "VIDEO",
    numHands: 2, // detect up to two, keep the largest (see "Picking the hand")
    minHandDetectionConfidence: 0.6, // start value
    minHandPresenceConfidence: 0.6, // start value
    minTrackingConfidence: 0.5, // start value
});

// Once per new camera frame (requestVideoFrameCallback). Timestamps must increase.
const result = landmarker.detectForVideo(video, performance.now());
// result.landmarks[i]       21 × {x, y, z}; x and y normalized to the image
// result.worldLandmarks[i]  21 × {x, y, z} in metres, origin near the hand centre
// result.handedness[i][0]   { categoryName: "Left" | "Right", score }
// HandLandmarker.HAND_CONNECTIONS lists the bones for drawing the skeleton.
```

- **Self-host the runtime files.** The build copies
  `node_modules/@mediapipe/tasks-vision/wasm/` to `dist/static/mediapipe/` and
  downloads the model once into `frontend/public/models/` (git-ignored: 7.8 MB is
  above CI's 5 MB file limit). Nothing is fetched from a CDN at demo time;
  venue wifi is unreliable.
- **Warm up during calibration.** The first `detectForVideo` compiles GPU
  shaders (around a second); never let that happen mid-round.

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

Run with `numHands: 2` and keep the hand with the largest wrist-to-middle-MCP
distance in image space, i.e. the one closest to the camera. Someone walking
behind the player cannot steal the crosshair. Stretch goal: keep both hands for
dual-wield.

## Pose: is this a finger gun?

Use the angle at each finger's PIP joint, between the vectors PIP→MCP and
PIP→tip (world landmarks): about 180° is straight, under about 100° is curled.

- Index straight: PIP angle > 150° (start value).
- Middle, ring, pinky curled: PIP angle < 120° (start value); at least 2 of the 3 must be curled.
- The thumb is not part of the pose; it is the trigger.
- Debounce: the pose becomes valid after 3 consecutive frames and invalid after 5.

The crosshair shows the state: bright when aiming; grey with the hint "Make a
finger gun 👉" when a hand is visible but not in pose; hidden, with a banner,
when no hand is visible.

## Aim

1. Raw point = index fingertip (landmark 8), x mirrored. The fingertip position
   is far steadier than extrapolating where the finger points, which is noisy in depth.
2. **Calibration box:** a comfortable region of the camera image (default
   x 0.2–0.8, y 0.15–0.75) maps to the whole game area, so small hand movements
   cover the screen and the player never has to reach the image edges, where
   tracking degrades. During calibration the player shoots practice targets at
   the top-left and bottom-right; we record where their fingertip was and
   set the box from those points, with a margin.
3. **Same box for the video:** the mirrored video is scaled and positioned so
   that the calibration box fills the game area. The crosshair then sits exactly
   on the on-screen fingertip (the AR effect: the muzzle flash appears on your
   finger) while movements stay small. One mapping function, `toGameArea(landmark)`,
   is used for the crosshair, the skeleton overlay and the video transform.
4. Clamp to 0..1, then apply a **One-Euro filter** (Casiez et al., 2012): an
   adaptive low-pass filter, smooth when the hand is slow and responsive when it
   is fast. Start values per axis: `minCutoff = 1.2`, `beta = 0.02`,
   `dCutoff = 1.0`.
5. Detection runs at camera rate (~30 Hz). The scene renders at 60 fps and eases
   the crosshair toward the latest filtered point, so it glides instead of stepping.
6. Optional (`AIM_EXTRAPOLATION`, default 0): push the crosshair slightly ahead
   of the fingertip along the 2D direction PIP→tip, so it reads as "where the gun points".

## Trigger: the thumb hammer

The thumb starts up (cocked) and drops onto the side of the index finger to fire.

- **Signal:** `t = distance(thumb tip 4, index MCP 5)` in world metres.
- **Hysteresis:** the gun is *cocked* when `t > T_UP`; it fires on the transition
  to `t < T_DOWN`, and must return above `T_UP` before it can fire again. Start
  values: `T_UP = 0.055 m`, `T_DOWN = 0.035 m`. Two thresholds stop flicker
  around a single threshold from producing double shots.
- **Cooldown:** at least 250 ms between shots (ASVZ-athlete perk: 30 % shorter).
- **Aim look-back:** dropping the thumb jerks the hand, so resolving the shot
  at the crosshair's *current* position misses. Keep a 300 ms ring buffer of
  filtered aim points and resolve each shot at the aim from about **100 ms
  before** the trigger fired. This one trick removes most of the "but I was on
  target!" frustration.
- Shots only fire while the pose is valid.
- Every threshold lives in `games/shooter/config.ts`. Tune them at the venue with
  the debug overlay and recordings from several people.

**Plan B: pinch.** If the thumb hammer tests badly, fire on thumb tip (4) to
index tip (8) distance instead. Same pipeline, same hysteresis; only the signal changes.

## Tracking loss and recovery

| Situation | Behavior |
|---|---|
| Hand out of view < 300 ms | Keep the last aim; no firing |
| Hand out of view > 1 s | Hide the crosshair, show "Show your finger gun"; could: pause the round timer |
| Camera denied, busy or missing; model fails to load | Switch to `MouseInput` automatically, toast "Mouse mode" |
| Tab hidden or window loses focus | Pause the round and reset the trigger state; resume on click |
| Operator presses `M` / `C` / `D` | Mouse mode / recalibrate / toggle the debug overlay |

## Input abstraction

```ts
// frontend/src/games/shooter/input/InputSource.ts (planned)
export type TrackingState = "ok" | "noPose" | "lost";

export interface InputSource {
    start(): Promise<void>;
    /** Latest aim in game-area coordinates 0..1, or null when there is none. */
    readonly aim: { x: number; y: number } | null;
    readonly tracking: TrackingState;
    /** Called once per shot with the point to resolve it at (look-back already applied). */
    onFire(listener: (at: { x: number; y: number }) => void): () => void;
    destroy(): void;
}
```

| Implementation | Purpose |
|---|---|
| `HandInput` | Camera + MediaPipe + `gesture.ts`. The real thing |
| `MouseInput` | Pointer position + click. Always available; the fallback and the operator override |
| `ReplayInput` | Plays a recorded landmark file through the same `gesture.ts`: build the scene without a camera, reproduce bugs deterministically |

`ShooterScene` never knows which source it has.

## Isometric 2D rendering with Phaser (what makes it feel like magic)

The shooter is a Phaser 4 scene with a **fixed view** and **isometric art**:
depth is faked in 2D, the way classic isometric games do it. The player stays
put and the targets come to them, so there are no camera controls to build, and
the shooter runs on the same engine and conventions as blackjack.

```ts
// games/shooter/ShooterScene.ts (planned): the core of the fake depth
// Every target has a distance z: 1 = far end of the exam hall, 0 = in your face.
const near = 1 - target.z;
target.sprite.setScale(Phaser.Math.Linear(FAR_SCALE, NEAR_SCALE, near));
target.sprite.setPosition(
    Phaser.Math.Linear(VANISH_X, target.laneX, near), // lanes fan out from the far end
    Phaser.Math.Linear(VANISH_Y, target.laneY, near),
);
target.sprite.setDepth(near); // nearer targets draw on top
target.sprite.setAlpha(Phaser.Math.Linear(FAR_ALPHA, 1, near)); // haze at the far end

// games/shooter/hitTest.ts (planned, pure, unit-tested): no engine needed
// Aim and targets share game-area coordinates (0..1); the nearest target under the aim wins.
export function hitTest(at: Point, targets: readonly TargetView[]): TargetView | null;
```

- **Isometric art carries the depth.** The exam hall, desks and props are
  pre-drawn isometric sprites at a 2:1 angle (Kenney isometric packs, CC0, or
  `make art` in the house style). Targets (exam papers, deadline clocks, coffee
  cups) are drawn at the same angle, with 2–4 frame flutter or spin animations.
  The code only scales, orders, fades and moves them.
- **Depth cues:** scale with distance, draw order by distance (`setDepth`), haze
  toward the far end, a soft blob shadow on the floor under each target, and a
  slight parallax between background layers when the screen shakes.
- **Targets fly toward the player** along lanes that fan out from the far end
  of the hall. A target that reaches `z = 0` without being hit counts as a
  miss. Targets and shards come from a `Phaser.GameObjects.Group` pool; nothing
  is created or destroyed mid-round. All sprites live in one texture atlas, so
  fifty targets still batch into a handful of draw calls.
- **Hit test:** at the look-back aim point, `hitTest` checks targets nearest
  first against a circle of `radius × scale`. It is a pure function over plain
  data, so it is unit-tested without Phaser.
- **Webcam background.** Start with the mirrored `<video>` element behind the
  transparent Phaser canvas (`transparent: true` in the game config) and a CSS
  filter, so it looks designed rather than like a video call. Upgrade (could):
  the video as a Phaser video game object with a Phaser 4 filter (duotone,
  scanlines). That is the WebGL showcase moment.
- **Hits shatter:** a Phaser particle emitter bursts the paper into small
  pre-drawn isometric shards with fading velocities, plus sparks.
- **Crosshair and hand skeleton:** a `Graphics` object on the top depth,
  positioned with the same `toGameArea()` mapping as the aim. The neon skeleton
  drawn from `HandLandmarker.HAND_CONNECTIONS` proves to the judges instantly
  that the hand is really tracked.
- **Feel:** muzzle flash at the fingertip, a small camera shake
  (`cameras.main.shake`) and a 50 ms hit-stop on hits, punchy sound, a combo
  counter, floating "+10", and a spark where a missed shot landed, so players
  learn the look-back aim.
- **Quality setting:** `standard` (no antialiasing, half the particles, no glow)
  and `sharp` (antialiasing, full particles, optional glow filter). Use `sharp`
  on the demo laptop only if it holds 60 fps with the camera on.
- **Renderer fallback:** Phaser picks WebGL and falls back to Canvas. Gameplay
  must never depend on filters or glow, so the shooter stays playable in Canvas
  mode; test it once with `type: Phaser.CANVAS`.
- **Lifecycle:** pause the round when the tab is hidden or the window loses
  focus. On WebGL context loss, pause and show "Graphics interrupted"; resume
  when the context is restored. `destroy()` stops the input source and calls
  `game.destroy(true)`, which stops the loop, frees textures and removes the canvas.

## Performance budget (per camera frame, ~33 ms)

| Step | Budget |
|---|---|
| `detectForVideo`, GPU delegate | about 5–15 ms on a recent laptop (CPU delegate: 20–40 ms); measure |
| Pose, aim, trigger, filter | < 1 ms |
| Phaser frame (game logic + render, one atlas, ≤ 50 active sprites) | < 6 ms |

Hand tracking and the Phaser scene share one GPU and the main thread.
`detectForVideo` is synchronous. If frames go over budget on the demo laptop, go
down this ladder, measuring after each step:

1. Quality `standard`: no antialiasing, half the particles, no glow.
2. Camera at 480×360.
3. Detect on every second camera frame (15 Hz) and keep easing the crosshair.
4. `numHands: 1`.
5. Move detection into a Web Worker (transfer frames as `ImageBitmap`). The most
   work; only if steps 1–4 are not enough.

## Debug overlay and tuning (`?debug=1` or `D`)

Shows the landmarks and skeleton, pose state and joint angles, the thumb
distance `t` with `T_UP` and `T_DOWN` drawn as lines, shots fired, detection time
in ms, frame times (p50/p95), active sprites and particles, the delegate in use (GPU or CPU), the quality setting
and the calibration box. All tunables come from `games/shooter/config.ts`. This
overlay is also the FPS test: run it on each team laptop with the camera on.

## Testing without a camera (and without credits)

- **Unit tests (vitest, planned)** for `gesture.ts`, the One-Euro filter and the
  calibration mapping:
  - synthetic hands from a helper (e.g. `makeHand({ thumb: "up", index: "straight" })`)
    for pose and trigger decisions;
  - recorded sequences in `games/shooter/input/fixtures/*.json` (a few seconds
    each, < 500 KB): "20 deliberate shots" must give 20 fires, "aiming without
    shooting" must give 0, "hand leaves the frame" must give no fire.
- **Recording:** `?record=1` on the shooter page downloads the session's
  landmark stream as JSON. Record several people (hand sizes, lighting) at the
  venue early. Recordings contain landmark numbers only, never images.
- **ReplayInput** lets the game owner work on the scene with real hand data and
  no camera.
- CI needs no camera, and CV never spends API credits.

## Demo setup checklist

- [ ] The demo laptop opens the app on a **secure origin**, one of:
  the VM's `https://` URL; an SSH tunnel (`ssh -L 8000:localhost:8000 <user>@<vm>`,
  then `http://localhost:8000`, since localhost counts as secure); or the
  laptop's own `make prod`. Judges' own devices need the HTTPS URL. Check
  `window.isSecureContext` on the exact URL.
- [ ] Light from the front (face the window or a lamp, never sit with a window
  behind you). Test the exact demo spot at the venue by T+12h.
- [ ] Camera at about eye level; hand 40–80 cm from it; a plain background if possible.
- [ ] Close video-call apps; they can lock the camera.
- [ ] Recent Chrome or Edge with hardware acceleration on (check `chrome://gpu`).
- [ ] Calibrate for every player; mouse fallback ready (`M`); a recorded video
  of a perfect run as the last resort.

## Who owns what

| Owner | Files |
|---|---|
| Shooter vision | `games/shooter/input/*` (`HandInput`, `gesture.ts`, filter, recording and replay, fixtures), model and wasm hosting, debug overlay |
| Shooter game | `games/shooter/ShooterScene.ts` (Phaser scene, isometric art, fake depth), `hitTest.ts`, scoring, juice, `MouseInput`, `config.ts` gameplay values |
| Shell | `components/shooter/App.tsx`: intro, camera permission UI, result screen, saving the score |
