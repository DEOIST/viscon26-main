# Thin wrappers around the real commands — see CLAUDE.md → "Commands" for the raw versions.
PY := backend/.venv/bin
URL ?= http://localhost:8000
.DEFAULT_GOAL := help

.PHONY: install dev dev-frontend dev-backend build test check format prod prod-logs prod-down smoke redis ai-check cv-check help

help:
	@echo "make install     npm install + backend venv"
	@echo "make dev         frontend watcher + backend autoreload → http://localhost:8000"
	@echo "make check       typecheck, prettier, vitest, ruff, pytest (run before every push)"
	@echo "make format      prettier --write + ruff fix/format"
	@echo "make test        backend tests only"
	@echo "make build       minified production frontend build"
	@echo "make prod        production stack in Docker → http://localhost:8000"
	@echo "make prod-logs   follow production container logs"
	@echo "make prod-down   stop the production stack"
	@echo "make smoke       end-to-end check of a running app (URL=... to target another)"
	@echo "make redis       optional local Redis on 127.0.0.1:6379 (dev works without it)"
	@echo "make ai-check    check every OpenAI key, free (LIVE=1: one tiny call per key)"
	@echo "make cv-check    stream a hand photo to a running finger-detection engine (URL=...)"

install:
	cd frontend && npm install
	python3 -m venv backend/.venv
	$(PY)/pip install -r backend/requirements-dev.txt

# Frontend watcher + backend autoreload in one terminal. Ctrl-C stops both.
dev:
	$(MAKE) -j2 dev-frontend dev-backend

dev-frontend:
	cd frontend && node build.js -w

dev-backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

build:
	cd frontend && node build.js --prod

test:
	cd backend && .venv/bin/pytest -q

# Run before every push.
check:
	cd frontend && npx tsc --noEmit && npx prettier --check . && npx vitest run
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest -q

format:
	cd frontend && npx prettier --write .
	cd backend && .venv/bin/ruff check --fix . && .venv/bin/ruff format .

# Production (Docker). See CLAUDE.md → "Production (Docker)".
prod:
	docker compose up --build -d

prod-logs:
	docker compose logs -f

prod-down:
	docker compose down

# Read-only end-to-end check of a running app: `make prod && make smoke`, or URL=<deployed url>.
smoke:
	scripts/smoke.sh $(URL)

# Optional real Redis for development; without it the backend uses an in-process fakeredis.
# Then set REDIS_URL=redis://localhost:6379/0 in backend/.env. Bound to localhost only.
redis:
	docker start ethlife-redis 2>/dev/null || docker run -d --name ethlife-redis -p 127.0.0.1:6379:6379 public.ecr.aws/docker/library/redis:8-alpine redis-server --appendonly yes

# Checks the keys in backend/.env without spending credits. LIVE=1 adds one 16-token call per key.
ai-check:
	cd backend && .venv/bin/python -m tools.ai_check $(if $(LIVE),--live,)

# End-to-end check of the finger-detection engine on a running server: no camera, no credits.
cv-check:
	cd backend && .venv/bin/python -m tools.cv_check $(URL)
