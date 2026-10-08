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
