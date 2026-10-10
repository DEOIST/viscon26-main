# Decisions

One line per decision, newest at the bottom. Say what was decided and why, so
nobody re-argues it at 3am. Link the issue or PR when there is one.

| Date | Decision | Why |
|------|----------|-----|
| 2026-10-07 | React + TypeScript frontend, bundled with esbuild, as a multi-page app (no client router) | Fast builds, no framework magic; each page is independent and easy to own |
| 2026-10-07 | FastAPI backend serves the API and the built frontend from one origin | No CORS, no proxy, one container to deploy |
| 2026-10-07 | Pydantic schemas with camelCase JSON; types mirrored in `CommonInt.ts` | Idiomatic naming on both sides with one explicit contract |
| 2026-10-07 | In-memory data store in `services/`, one uvicorn worker | Zero setup for the starter; revisit at T+2h if data must survive restarts |
| 2026-10-07 | Production = one Docker image (`Dockerfile`, `compose.yaml`) | Same artifact locally, in CI and on the event VM |
| 2026-10-08 | CI: four required checks; CD publishes the image to GHCR after CI passes on `main` | Matches the `protect-main` ruleset; deploys exactly what CI tested |
| 2026-10-09 | Idea: ETH Life. Create an ETH student, play Blackjack and a webcam finger-gun shooter; the average score picks one of 5 careers at graduation (#1) | Team choice; the finger-gun CV is the wow feature ([GAME_DESIGN.md](GAME_DESIGN.md)) |
| 2026-10-09 | Keep the starter stack (React + esbuild MPA, FastAPI one origin, one image); one page per game scene, run id in `?run=` | Per-scene bundles, separate ownership, camera and WebGL released on page exit, crash = one reload ([ARCHITECTURE.md](ARCHITECTURE.md)) |
| 2026-10-09 | Both minigames in Phaser 4: blackjack in plain 2D, the CV shooter in 2D with isometric art that fakes depth (scale, draw order, haze); one `MountMinigame` contract, React for everything around a round. Three.js 3D, raw WebGL and React Three Fiber rejected | One engine and one set of conventions for the whole team; isometric art gives the "flying at you" read without a second engine, 3D assets or extra GPU load next to hand tracking; a hand-written renderer would take days ([STACK.md](STACK.md)) |
| 2026-10-09 | Hand tracking with MediaPipe HandLandmarker in the browser; thumb-hammer trigger, mouse fallback; no CV on the server (superseded on 2026-10-10 by #13, below) | Latency and privacy; no API cost ([SHOOTER_CV.md](SHOOTER_CV.md)) |
| 2026-10-09 | Redis 8 for runs, Hall of Fame, AI cache and budget counters; fakeredis in development and tests | Team choice; sorted sets fit the leaderboard; replaces the in-memory store |
| 2026-10-09 | Character creation at enrollment: name, pronouns, department, archetype (with a perk), avatar | Personalizes the story, the AI text and gameplay |
| 2026-10-09 | Endings: average of the minigame scores in 5 tiers, computed on the server | Simple to explain, balance and test |
| 2026-10-09 | OpenAI only via the backend (`app/ai.py`): dialogue packs, epilogue, narration, offline art; `AI_MODE=off` by default; POST-only, cached, with fallbacks | Keys stay secret; credits are spent only on purpose |
| 2026-10-09 | The 6 OpenAI keys form an ordered failover chain (on invalid key or exhausted credit, not to dodge rate limits); 3 for the VM, 3 for AI developers | Uses the credits legitimately; protects the demo budget |
| 2026-10-09 | Tests spend zero credits: FakeAI, fakeredis, network blocked with pytest-socket; the smoke test sends GETs only | API credits are limited and must not leak into testing |
| 2026-10-09 | No Redux and no Postgres: the character and run are saved through the API in Redis and travel between pages as `?run=` (supersedes issues #3, #4, #7) | Every page is a full page load, which wipes a client store; one data store is enough |
| 2026-10-09 | Game FPS is measured on the team's laptops with the camera on (`?debug=1` overlay), never on the VM or in CI | Rendering and hand tracking run in the player's browser; the VM and CI have no GPU |
| 2026-10-09 | Docker base images (and Redis) come from `public.ecr.aws/docker/library/`, no `# syntax=` line (#11) | Docker Hub rate-limits anonymous pulls per IP; CI runners and the event network share IPs. Same digests as Docker Hub |
| 2026-10-10 | `AI_MODE` is set only in the server's `.env` (default `off`), never in the Compose files (#14) | A local `make prod` must never spend credits by surprise |
| 2026-10-10 | Foundation shipped with placeholder minigames: the contract, Redis, OpenAI plumbing and every page work end to end before the real games land (#14) | Six tracks can build in parallel against a running skeleton |
| 2026-10-10 | Finger detection runs in the Python backend: MediaPipe HandLandmarker per WebSocket session on `/api/cv/stream`, gesture rules in `services/gesture.py`; supersedes MediaPipe in the browser (#13) | Team choice in #13: one tested engine in Python and a light browser. The costs are capped: one frame in flight, `CV_MAX_SESSIONS`, idle streams closed, frames never stored |
| 2026-10-10 | The browser drops `@mediapipe/tasks-vision`; the build still downloads the hand model, now for the server (#13) | Nothing in the browser uses it any more; 20 MB less on the shooter's first visit |
| 2026-10-10 | CV speed is measured with `make cv-check URL=<server>` against the server the demo uses; game FPS stays a laptop measurement (#13) | Detection now runs on the server's CPU, rendering still in the browser |
| 2026-10-10 | vitest for pure frontend logic, run by `make check`; adding it to CI waits for an explicit OK on `ci.yml` (#13) | The shooter's math and frame pacing get tests without changing CI rules unasked |
| 2026-10-10 | The shooter's warm-up (three practice papers) is the tutorial; the browser only fits the default box to the camera's shape, per-player calibration waits until playtests ask for it (#13) | With the AR overlay the default box already puts the crosshair on the fingertip; fitting keeps the webcam image undistorted |
| 2026-10-10 | The CV stream is hardened for anonymous clients: JPEG frames only, each side ≤ 1280 px, control messages ≤ 1 KB and schema-validated, WebSocket messages ≤ 1 MiB, only camera frames keep a slot, engine errors stay in the server log in production, the hand model's SHA-256 is pinned (#13) | A 32767-px-wide frame aborts OpenCV and kills the whole server; big messages stall the event loop; chatter could hold every slot |
