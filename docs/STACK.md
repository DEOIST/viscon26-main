# Stack

What we use, which version, and why. Decided on 2026-10-09 (see
[DECISIONS.md](DECISIONS.md)); how the parts connect is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Verdict

The starter stack is a good base for this game and stays: React + TypeScript
bundled by esbuild as a multi-page app, served together with the API by FastAPI
from one origin, shipped as one Docker image. We add five things on top:

1. **Phaser 4**, the 2D WebGL engine for blackjack;
2. **Three.js**, the 3D WebGL engine for the finger-gun shooter;
3. **MediaPipe** hand tracking in the browser, for the shooter's controls;
4. **Redis**, for runs, the Hall of Fame and AI caching;
5. **OpenAI**, called only from the backend.

Nothing is replaced, and nobody has to relearn the build. Each page loads only
the engine it uses, so mixing a 2D and a 3D engine costs nothing at runtime.

## The stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Outer shell | React + TypeScript | React 19.3, TS 7 | Existing. Menus, the character creator, the hub and overlays are classic UI |
| Bundler | esbuild multi-page build (`frontend/build.js`) | 0.28 | Existing and fast. Per-page bundles keep each engine and MediaPipe off pages that don't use them |
| Inner shell, blackjack | **Phaser** (2D, WebGL renderer) | 4.2 | A complete 2D game framework: scenes, sprites, tweens, text, input, audio. A card game is mostly UI, and Phaser builds that fastest. Phaser's official React template runs Phaser 4 with React 19 |
| Inner shell, shooter | **Three.js** (3D, `WebGLRenderer` on WebGL2), used directly (no React wrapper) | 0.186 | Depth makes the CV shooter spectacular: targets fly toward you over your webcam image, hits are ray casts. Tree-shakes well; context loss, pixel ratio and color management are built in |
| Hand tracking | **`@mediapipe/tasks-vision`**, HandLandmarker | 1.1 | 21 hand landmarks per frame on the GPU in the browser: no server work, no API cost, no video leaves the laptop |
| Backend | FastAPI + Pydantic | 0.142 / 2.13 | Existing. One origin, a typed contract |
| Database | **Redis** (`redis:8-alpine`) with **redis-py** | server 8, client 8.1 | Runs as JSON, a sorted-set leaderboard, the AI cache and budget counters; AOF on a named volume. No client-side store (no Redux): every page is a full page load |
| AI | **OpenAI** Python SDK (Responses, Audio, Images, Moderations) | 3.27 | Dialogue and epilogue with Structured Outputs, narration, offline art |
| Backend tests | pytest + fakeredis + pytest-socket | 9.1 / 2.39 / 0.8 | No Redis server needed; network blocked, so tests cannot spend credits |
| Frontend tests | vitest *(planned)* | 5.0 | Pure logic only: blackjack rules, gesture detection |
| Runtime | Node ≥ 26.5, Python ≥ 3.12 (the image uses 3.14) | | Existing (`frontend/.nvmrc`, `Dockerfile`) |

## Measured download sizes

Production bundles built with esbuild (`--minify`, ESM) and `gzip -9` from
small probe entries on 2026-10-09. The real pages will differ a little.

| What | Minified | Gzipped | Loaded on |
|---|---|---|---|
| Three.js 0.186, the subset a 3D shooter uses (renderer, camera, meshes, lights, instancing, points, video texture, raycaster) | 529 KB | 132 KB | `/shooter` |
| Phaser 4.2, minimal game (Phaser hardly tree-shakes) | 1 362 KB | 360 KB | `/blackjack` |
| `@mediapipe/tasks-vision` JavaScript | 151 KB | 45 KB | `/shooter` |
| MediaPipe wasm runtime (one variant is loaded) + hand model | 12.4 MB + 7.8 MB | served as static files | `/shooter` |

The MediaPipe runtime is the heaviest download in the app, far more than either
engine. Serve it compressed and preload it on the shooter intro screen (see
ARCHITECTURE.md → Deployment).

## To add (in the PR that first needs it, not before)

| Package | Where | Priority | For |
|---|---|---|---|
| `phaser@^4.2.1` | frontend dependencies | must | Blackjack |
| `three@^0.186.1` | frontend dependencies | must | The 3D shooter |
| `@types/three@^0.186.0` | frontend devDependencies | must | Types for Three.js (it ships none) |
| `@mediapipe/tasks-vision@^1.1.0` | frontend dependencies | must | Finger-gun tracking |
| `redis>=8.1` | `backend/requirements.txt` | must | Storage |
| `openai>=3.27` | `backend/requirements.txt` | must | Story, narration, art |
| `fakeredis>=2.39` | `backend/requirements-dev.txt` | must | Tests and Redis-free development |
| `pytest-socket>=0.8` | `backend/requirements-dev.txt` | must | Blocks the network in tests: credit safety |
| `vitest@^5` | frontend devDependencies | should | Pure logic tests. Adding it to CI changes `ci.yml`, which needs an explicit OK |
| `motion@^14` | frontend dependencies | could | Ending reveal and page transitions |
| `canvas-confetti@^1.9` | frontend dependencies | could | Confetti for the C-level ending |

Follow "Add a dependency" in [CLAUDE.md](../CLAUDE.md): tell the team, commit the lockfile.

## Considered and rejected

| Option | Why not |
|---|---|
| Switching to Vite | Hours of migration in the middle of the event; hot reload doesn't help a canvas game; esbuild already does what we need |
| Single-page app, react-router | One page per scene gives isolation and parallel ownership for free (see ARCHITECTURE.md) |
| Redux, Zustand | Every navigation is a full page load, which wipes a client store: character data put into Redux on `/enroll` would be gone on `/campus`. The run lives on the server (Redis) and the page reads it from the API |
| Postgres | Works, but Redis already covers runs, the leaderboard (sorted set), the AI cache and the budget counters; one data store is enough |
| Raw WebGL (hand-written renderer) | Matrices, shaders, lighting, textures, picking, particles and text by hand: days of work. Three.js *is* WebGL (WebGL2) and does all of it |
| React Three Fiber | Puts React into the 60 fps render loop and breaks the rule that `games/` never imports React; plain Three.js fits the `MountMinigame` contract directly |
| Three.js for blackjack too | One engine would be tidy, but card UI (buttons, text, tweens) is much faster in Phaser, and each page loads only its own engine anyway |
| Phaser for the shooter | Fine in 2D, but 3D depth multiplies the wow of the CV feature, and Three.js is the smaller download |
| PixiJS | A renderer only; we would hand-roll scenes, tweens and audio |
| Computer vision on the server (Python, OpenCV) | Video over the network means lag on every shot, server load and a privacy problem |
| MediaPipe GestureRecognizer | Has no finger-gun gesture and adds a classifier; raw landmarks plus our own geometry are simpler and tunable |
| redis-om | Needs Redis Stack features we don't use; plain keys, JSON strings and one sorted set cover everything |
| Calling OpenAI from the browser | Would expose the keys to anyone who opens the page |
| Streaming AI responses (SSE) | A client-side typewriter gives the same feel with plain JSON |
| Generating images at runtime | 10–30 s latency, moderation risk, cost. We generate the art offline instead |
| howler, gsap | Phaser has audio and tweens; small easing helpers cover Three.js; CSS (or `motion`) covers the React side |
| Tailwind, UI kits | CSS Modules with design tokens are the convention, and game UI is custom anyway |

## OpenAI models

All configurable through `backend/.env`; checked against developers.openai.com
on 2026-10-09.

| Setting | Default | Notes |
|---|---|---|
| `OPENAI_TEXT_MODEL` | `gpt-6-luna` | $0.10 / $0.50 per 1M tokens; reasoning effort `none` for speed; Structured Outputs |
| `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | `gpt-4o-mini-tts`, `cedar` | 13 voices (`marin` and `cedar` recommended); `instructions` steers the speaking style |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-sunburst` | Offline only (`make art`); `output_format: "webp"`, transparent backgrounds |
| (fixed) | `omni-moderation-latest` | Name moderation; the endpoint is free |

Model availability differs between accounts: run `make ai-check` *(planned, free)*
at the start of the event.

## Assets and tools

- **Kenney.nl** (CC0): playing cards, chips, UI elements, crosshairs, particles,
  and low-poly 3D kits for the shooter.
- **`make art`** *(planned)*: generated avatars, ending scenes, backgrounds,
  textures for the 3D targets (exam papers, clocks) and fallback narration, in
  the house style described in GAME_DESIGN.md.
- **jsfxr**: retro sound effects in seconds.
- Every committed file must be under 5 MB (CI rejects larger files). Prefer webp
  for images, keep 3D models small (glTF/glb, low-poly) and credit third-party assets.
