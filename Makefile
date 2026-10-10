# Thin wrappers around the real commands — see CLAUDE.md → "Commands" for the raw versions.
PY := backend/.venv/bin
URL ?= http://localhost:5173
# Host port of the local backend, shared with compose.yaml: set BACKEND_PORT=8001 in the root .env
# when 8000 is taken (e.g. by an editor's port forward to the VM). Only this key is read from .env.
BACKEND_PORT ?= $(or $(shell sed -n 's/^BACKEND_PORT=//p' .env 2>/dev/null | tail -n 1),8000)
.DEFAULT_GOAL := help

.PHONY: install dev dev-db dev-frontend dev-backend build test check format prod prod-logs prod-down smoke redis ai-check help

help:
	@echo "make install     npm install + backend venv"
	@echo "make dev         Postgres (Docker) + Vite + backend autoreload at http://localhost:5173"
	@echo "make check       typecheck, prettier, ruff, pytest (run before every push)"
	@echo "make format      prettier --write + ruff fix/format"
	@echo "make test        backend tests only"
	@echo "make build       minified production frontend build"
	@echo "make prod        local Docker stack at http://localhost:5173"
	@echo "make prod-logs   follow production container logs"
	@echo "make prod-down   stop the production stack"
	@echo "make smoke       end-to-end check of a running app (URL=... to target another)"
	@echo "make redis       optional local Redis on 127.0.0.1:6379 (dev works without it)"
	@echo "make ai-check    check every OpenAI key, free (LIVE=1: one tiny call per key)"

install:
	cd frontend && npm ci
	python3 -m venv backend/.venv
	$(PY)/pip install -r backend/requirements-dev.txt

# Vite + backend autoreload at http://localhost:5173. Ctrl-C stops both.
dev: dev-db
	$(MAKE) -j2 dev-frontend dev-backend

# The backend needs Postgres for player progress (127.0.0.1:5433, its default). Start the
# compose `db` service and wait until it is healthy; a running one is left as is. With your own
# DATABASE_URL instead, run `make -j2 dev-frontend dev-backend`.
dev-db:
	docker compose up -d --wait db

# The proxy target follows BACKEND_PORT, so Vite never talks to whatever else holds 8000.
dev-frontend:
	cd frontend && API_PROXY_TARGET=http://127.0.0.1:$(BACKEND_PORT) npm run dev

dev-backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port $(BACKEND_PORT)

build:
	cd frontend && npm run build

test:
	cd backend && .venv/bin/pytest -q

# Run before every push.
check:
	cd frontend && npm run check && npm test
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
