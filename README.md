# ETH Life (working title)

Our VIScon 2026 game: create your ETH student, bet your stipend at blackjack, shoot exam questions out of the air with a webcam finger gun, and find out what career your scores earn you at graduation.

React + Phaser 4 (WebGL) frontend with in-browser hand tracking (MediaPipe), FastAPI + Redis backend, and an OpenAI-written story, served from a single origin.

```bash
make install   # npm install + Python venv
make dev       # http://localhost:8000
make check     # typecheck, lint, format check, tests — run before pushing
make prod      # production build in Docker (docker compose up --build -d)
```

Requires Node >= 26.5 and Python >= 3.12. Without `make`, see the raw commands in [CLAUDE.md](CLAUDE.md).

**Read [CLAUDE.md](CLAUDE.md) before contributing.** It covers the architecture, conventions and workflow, for humans and Claude Code alike. Then:

- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md): what we build
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it fits, the API contract, API keys, testing, build order
- [docs/SHOOTER_CV.md](docs/SHOOTER_CV.md): the finger-gun computer vision
- [docs/STACK.md](docs/STACK.md): tools, versions and rejected options
