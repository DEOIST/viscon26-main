# Contributing

Several people, one repo, very little time. These rules exist so we never lose
work and never break the demo. How the code is structured and written is in
[CLAUDE.md](CLAUDE.md); read it before your first PR.

## The flow

1. **Pick an issue** from the [issue list](https://github.com/DEOIST/viscon-2026/issues).
   Assign yourself, add the `doing` label. No issue? Create one from the Bug or
   Feature template; it takes 20 seconds.
2. **Branch from the latest `main`:**
   ```bash
   git fetch origin
   git switch -c feat/12-short-name origin/main     # <type>/<issue>-<slug>
   ```
   Types: `feat`, `fix`, `chore`, `docs`, `pitch`.
3. **Commit small and often.** Push your branch at least every hour, even half-done work.
   ```
   feat: add upload endpoint (#12)
   ```
4. **Open a pull request early** (as Draft). The template asks for `Closes #12`,
   how to check it and what you ran.
   ```bash
   gh pr create --draft --fill
   ```
5. **Wait for CI** (green checks on the PR, a few minutes; the Docker smoke test
   is the slowest). Red means fix before merging: `gh run view --log-failed`
   shows why, `make check` reproduces most of it locally.
6. **Review:** one teammate glances at it. Two minutes, not twenty: does it run,
   does it break the demo path? Approval is welcome but not required.
7. **Squash and merge.** The PR title becomes the commit on `main`, so it must
   follow the commit format above. The branch is deleted automatically. Merging
   to `main` triggers CD: the Docker image is published to GitHub Container
   Registry, and deployed once a server is set up.

**`main` must always demo.** Never push to `main` directly; always go through a
pull request. If `main` breaks, fixing it is everyone's top priority (revert
first, fix after). The full rules (and what AI agents must follow) are in
[docs/BRANCH_RULES.md](docs/BRANCH_RULES.md) and [AGENTS.md](AGENTS.md).

## Rules of thumb

- **Pull before you start, push before you stop.** Merge `origin/main` into your
  branch at least hourly. Merge conflicts at 3am are how hackathons are lost.
- **Shared files are append-only.** `CommonInt.ts`, `schemas.py`, `apiClient.ts`,
  `routers/__init__.py` and `Layout.tsx` are edited by everyone: add your
  section under a `--- <feature> ---` header and don't reorder others'.
- **Agree on the API first.** Push the types (`backend/app/schemas.py` +
  `frontend/src/misc/CommonInt.ts`) before building both sides in parallel.
- **Never commit secrets.** Keys go in `backend/.env` (git-ignored). Add the
  variable name to `backend/.env.example` so others know it exists. CI fails if
  a `.env` is committed.
- **Stuck for more than 20 minutes?** Say so. Add the `blocked` label and tell
  the team.
- **Hardcoding is fine** if it's on the demo path and noted with `// HACK:`
  (TypeScript) or `# HACK:` (Python). Polish only what judges will see.
- **Write down decisions** in [docs/DECISIONS.md](docs/DECISIONS.md), one line each.

## Labels

| Label | Meaning |
|-------|---------|
| `must` / `should` / `could` | Priority. Only `must` is guaranteed in the demo. |
| `doing` / `review` / `blocked` | Status. |
| `frontend` / `backend` / `data` / `pitch` | Area. |
| `bug` | Something is broken. |
| `demo-path` | Touches what we show the judges. Extra care. |

## Useful commands

Setup, raw commands and recipes (add a page, add an endpoint) are in
[CLAUDE.md](CLAUDE.md).

```bash
make help        # list all tasks
make install     # first-time setup: npm install + backend venv
make dev         # frontend watcher + backend autoreload on http://localhost:8000
make check       # typecheck, prettier, ruff, pytest; run before pushing
make build       # production frontend build (CI's frontend job also runs this)
make prod        # production stack in Docker on http://localhost:8000
make smoke       # end-to-end checks against the running app (URL=... for another host)
```

CI runs four checks on every PR (`.github/workflows/ci.yml`): `Repo hygiene`,
`Backend (ruff + pytest)`, `Frontend (tsc + prettier + build)` and
`End-to-end smoke (Docker)`. `make check` covers the backend and most of the
frontend job; `make build` and `make prod && make smoke` cover the rest.
