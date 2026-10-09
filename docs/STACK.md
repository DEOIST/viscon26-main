# Stack

What we use, which version, and why. Decided on 2026-10-09 (see
[DECISIONS.md](DECISIONS.md)); how the parts connect is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Verdict

The starter stack is a good base for this game and stays: React + TypeScript
bundled by esbuild as a multi-page app, served together with the API by FastAPI
from one origin, shipped as one Docker image. We add four things on top:

1. **Phaser 4**, the WebGL inner shell for both minigames;
2. **MediaPipe** hand tracking in the browser, for the finger-gun shooter;
3. **Redis**, for runs, the Hall of Fame and AI caching;
4. **OpenAI**, called only from the backend.

Nothing is replaced, and nobody has to relearn the build.

## The stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Outer shell | React + TypeScript | React 19.3, TS 7 | Existing. Menus, the character creator, the hub and overlays are classic UI |
| Bundler | esbuild multi-page build (`frontend/build.js`) | 0.28 | Existing and fast. Per-page bundles with shared chunks keep Phaser and MediaPipe off pages that don't use them |
| Inner shell | **Phaser** (WebGL renderer) | 4.2 | A complete 2D game framework: scenes, sprites, tweens, particles, audio, input, physics. One engine for both minigames. Phaser's official React template runs Phaser 4 with React 19 |
| Hand tracking | **`@mediapipe/tasks-vision`**, HandLandmarker | 1.1 | 21 hand landmarks per frame on the GPU in the browser: no server work, no API cost, no video leaves the laptop |
| Backend | FastAPI + Pydantic | 0.142 / 2.13 | Existing. One origin, a typed contract |
| Database | **Redis** (`redis:8-alpine`) with **redis-py** | server 8, client 8.1 | Runs as JSON, a sorted-set leaderboard, the AI cache and budget counters; AOF on a named volume |
| AI | **OpenAI** Python SDK (Responses, Audio, Images, Moderations) | 3.27 | Dialogue and epilogue with Structured Outputs, narration, offline art |
| Backend tests | pytest + fakeredis + pytest-socket | 9.1 / 2.39 / 0.8 | No Redis server needed; network blocked, so tests cannot spend credits |
| Frontend tests | vitest *(planned)* | 5.0 | Pure logic only: blackjack rules, gesture detection |
| Runtime | Node ≥ 26.5, Python ≥ 3.12 (the image uses 3.14) | | Existing (`frontend/.nvmrc`, `Dockerfile`) |

## To add (in the PR that first needs it, not before)

| Package | Where | Priority | For |
|---|---|---|---|
| `phaser@^4.2.1` | frontend dependencies | must | Both minigames |
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
| Redux, Zustand | State per page is small, and the run lives in Redis |
| Raw WebGL | Shaders, batching, text and input by hand: weeks of work, not hours |
| PixiJS | A renderer only; we would hand-roll scenes, tweens and audio |
| Three.js / React Three Fiber | 3D adds art and camera work the 2D games don't need |
| Computer vision on the server (Python, OpenCV) | Video over the network means lag on every shot, server load and a privacy problem |
| MediaPipe GestureRecognizer | Has no finger-gun gesture and adds a classifier; raw landmarks plus our own geometry are simpler and tunable |
| redis-om, an SQL database | Plain keys, JSON strings and one sorted set cover everything |
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

- **Kenney.nl** (CC0): playing cards, chips, UI elements, crosshairs, particles.
- **`make art`** *(planned)*: generated avatars, ending scenes, backgrounds and
  fallback narration, in the house style described in GAME_DESIGN.md.
- **jsfxr**: retro sound effects in seconds.
- Every committed file must be under 5 MB (CI rejects larger files). Prefer webp
  for images and credit third-party assets.
