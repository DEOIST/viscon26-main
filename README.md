# Hackathon Project

React (esbuild) frontend + FastAPI backend, served from a single origin.

```bash
make install   # npm install + Python venv
make dev       # http://localhost:8000
make check     # typecheck, lint, format check, tests — run before pushing
make prod      # production build in Docker (docker compose up --build -d)
```

Requires Node >= 26.5 and Python >= 3.12. Without `make`, see the raw commands in [CLAUDE.md](CLAUDE.md).

**Read [CLAUDE.md](CLAUDE.md) before contributing.** It covers the architecture, conventions and workflow, for humans and Claude Code alike.
