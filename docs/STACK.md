# Stack

What we use, which version, and why. Decided on 2026-10-09 (see
[DECISIONS.md](DECISIONS.md)); how the parts connect is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Verdict

The starter stack is a good base for this game and stays: React + TypeScript
bundled by esbuild as a multi-page app, served together with the API by FastAPI
from one origin, shipped as one Docker image. We add four things on top:

1. **Phaser 4**, the 2D WebGL engine for both minigames; the shooter fakes
   depth with isometric art instead of using a 3D engine;
2. **MediaPipe** hand tracking in the backend (Python), for the shooter's
   controls (#13);
3. **Redis**, for runs, the Hall of Fame and AI caching;
4. **OpenAI**, called only from the backend.

Nothing is replaced, and nobody has to relearn the build. One engine means one
set of conventions for the whole team, and esbuild puts Phaser into one chunk
that both game pages share.

## The stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Outer shell | React + TypeScript | React 19.3, TS 7 | Existing. Menus, the character creator, the hub and overlays are classic UI |
| Bundler | esbuild multi-page build (`frontend/build.js`) | 0.28 | Existing and fast. Per-page bundles keep Phaser off pages that don't use it |
| Inner shell, both minigames | **Phaser** (2D, WebGL renderer with Canvas fallback) | 4.2 | A complete 2D game framework: scenes, sprites, tweens, particles, text, input, audio. A card game is mostly UI, and Phaser builds that fastest; the shooter fakes depth with isometric sprites (scale, draw order, haze), so it needs no second engine. Phaser's official React template runs Phaser 4 with React 19 |
| Hand tracking | **`mediapipe`** (Python), HandLandmarker, with **Pillow** and **NumPy** | 1.1 / 12.3 / 2.5 | 21 hand landmarks per frame on the server's CPU (9–20 ms per 320 px frame), streamed over a WebSocket; one tested engine in Python, no API cost. Needs five system libraries in the slim image (SHOOTER_CV.md → The engine) |
| Backend | FastAPI + Pydantic | 0.142 / 2.13 | Existing. One origin, a typed contract |
| Database | **Redis** (`redis:8-alpine`) with **redis-py** | server 8, client 8.1 | Runs as JSON, a sorted-set leaderboard, the AI cache and budget counters; AOF on a named volume. No client-side store (no Redux): every page is a full page load |
| AI | **OpenAI** Python SDK (Responses, Audio, Images, Moderations) | 3.27 | Dialogue and epilogue with Structured Outputs, narration, offline art |
| Backend tests | pytest + fakeredis + pytest-socket | 9.1 / 2.39 / 0.8 | No Redis server needed; network blocked, so tests cannot spend credits |
| Frontend tests | vitest (in `make check`, not yet in CI) | 5.0 | Pure logic only: the shooter's depth, hit test, score, stream protocol and frame pacing; blackjack rules next |
| Runtime | Node ≥ 26.5, Python ≥ 3.12 (the image uses 3.14) | | Existing (`frontend/.nvmrc`, `Dockerfile`) |

## Measured download sizes

Production bundles built with esbuild (`--minify`, ESM) and `gzip -9` from
small probe entries on 2026-10-09. The real pages will differ a little.

| What | Minified | Gzipped | Loaded on |
|---|---|---|---|
| Phaser 4.2, minimal game (Phaser hardly tree-shakes) | 1 362 KB | 360 KB | `/blackjack`, `/shooter` (one shared chunk, cached after the first game) |

Since #13 the browser loads no MediaPipe at all (it was 151 KB of JavaScript
plus a 12.4 MB wasm runtime and the 7.8 MB model). The model stays on the
server; the shooter uploads one ~10 KB JPEG per camera frame instead.

## To add (in the PR that first needs it, not before)

| Package | Where | Priority | For |
|---|---|---|---|
| `phaser@^4.2.1` | frontend dependencies | must | Blackjack and the shooter (added in #12) |
| `mediapipe>=1.1`, `pillow>=12`, `numpy>=2` | `backend/requirements.txt` | must | The finger-detection engine (added in #13) |
| `redis>=8.1` | `backend/requirements.txt` | must | Storage (added in #12) |
| `openai>=3.27` | `backend/requirements.txt` | must | Story, narration, art (added in #12) |
| `fakeredis>=2.39` | `backend/requirements-dev.txt` | must | Tests and Redis-free development (added in #12) |
| `pytest-socket>=0.8` | `backend/requirements-dev.txt` | must | Blocks the network in tests: credit safety (added in #12) |
| `vitest@^5` | frontend devDependencies | should | Pure logic tests (added in #13, run by `make check`). Adding it to CI changes `ci.yml`, which needs an explicit OK |
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
| A real 3D shooter with Three.js | Briefly chosen, then dropped: a second engine with its own conventions, 3D assets to source, and more GPU load next to hand tracking. Isometric art with depth-scaled sprites gives the same "flying at you" read in the demo. Revisit only if both games are finished early |
| Raw WebGL (hand-written renderer) | Matrices, shaders, lighting, picking, particles and text by hand. A local spike (`agent/fixed-camera-3d`) renders and passes its browser checks, but it is a scene, not a game, and every game feature would still be ours to write |
| React Three Fiber | Puts React into the render loop and breaks the rule that `games/` never imports React; moot without a 3D engine |
| PixiJS | A renderer only; we would hand-roll scenes, tweens and audio |
| MediaPipe in the browser (`@mediapipe/tasks-vision`) | Our first plan, replaced by the backend engine in #13: a 20 MB first download, the hand model sharing the GPU and main thread with Phaser, and gesture logic in TypeScript instead of next to the team's Python. Its advantage, no network in the loop, is what the server setup has to earn back (SHOOTER_CV.md → Why on the server) |
| Hand-written OpenCV vision (skin colour, contours) | Fragile under venue lighting; MediaPipe's landmark model is far more robust and gives 3D points |
| MediaPipe GestureRecognizer | Has no finger-gun gesture and adds a classifier; raw landmarks plus our own geometry are simpler and tunable |
| redis-om | Needs Redis Stack features we don't use; plain keys, JSON strings and one sorted set cover everything |
| Calling OpenAI from the browser | Would expose the keys to anyone who opens the page |
| Streaming AI responses (SSE) | A client-side typewriter gives the same feel with plain JSON |
| Generating images at runtime | 10–30 s latency, moderation risk, cost. We generate the art offline instead |
| howler, gsap | Phaser has audio and tweens; CSS (or `motion`) covers the React side |
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
  and isometric packs (tiles, desks, props) for the shooter's exam hall.
- **`make art`** *(planned)*: generated avatars, ending scenes, backgrounds,
  isometric target sprites (exam papers, clocks) and fallback narration, in
  the house style described in GAME_DESIGN.md.
- **jsfxr**: retro sound effects in seconds.
- Every committed file must be under 5 MB (CI rejects larger files). Prefer webp
  for images, pack sprites into texture atlases and credit third-party assets.
