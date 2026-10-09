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
| 2026-10-09 | Blackjack in Phaser 4 (2D); the CV shooter in 3D with Three.js used directly (WebGL2); both behind one `MountMinigame` contract, React for everything around a round. Raw WebGL and React Three Fiber rejected | Phaser builds card UI fastest; 3D depth multiplies the CV wow and Three.js is ~132 KB gzipped; a hand-written renderer would take days; R3F would put React in the render loop ([STACK.md](STACK.md)) |
| 2026-10-09 | Hand tracking with MediaPipe HandLandmarker in the browser; thumb-hammer trigger, mouse fallback; no CV on the server | Latency and privacy; no API cost ([SHOOTER_CV.md](SHOOTER_CV.md)) |
| 2026-10-09 | Redis 8 for runs, Hall of Fame, AI cache and budget counters; fakeredis in development and tests | Team choice; sorted sets fit the leaderboard; replaces the in-memory store |
| 2026-10-09 | Character creation at enrollment: name, pronouns, department, archetype (with a perk), avatar | Personalizes the story, the AI text and gameplay |
| 2026-10-09 | Endings: average of the minigame scores in 5 tiers, computed on the server | Simple to explain, balance and test |
| 2026-10-09 | OpenAI only via the backend (`app/ai.py`): dialogue packs, epilogue, narration, offline art; `AI_MODE=off` by default; POST-only, cached, with fallbacks | Keys stay secret; credits are spent only on purpose |
| 2026-10-09 | The 6 OpenAI keys form an ordered failover chain (on invalid key or exhausted credit, not to dodge rate limits); 3 for the VM, 3 for AI developers | Uses the credits legitimately; protects the demo budget |
| 2026-10-09 | Tests spend zero credits: FakeAI, fakeredis, network blocked with pytest-socket; the smoke test sends GETs only | API credits are limited and must not leak into testing |
| 2026-10-09 | No Redux and no Postgres: the character and run are saved through the API in Redis and travel between pages as `?run=` (supersedes issues #3, #4, #7) | Every page is a full page load, which wipes a client store; one data store is enough |
| 2026-10-09 | Game FPS is measured on the team's laptops with the camera on (`?debug=1` overlay), never on the VM or in CI | Rendering and hand tracking run in the player's browser; the VM and CI have no GPU |
