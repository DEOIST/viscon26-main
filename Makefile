# Thin wrappers around the real commands — see CLAUDE.md → "Commands" for the raw versions.
PY := backend/.venv/bin
URL ?= http://localhost:8000
.DEFAULT_GOAL := help

.PHONY: install dev dev-frontend dev-backend build test check format prod prod-logs prod-down smoke help

help:
	@echo "make install     npm install + backend venv"
	@echo "make dev         frontend watcher + backend autoreload → http://localhost:8000"
	@echo "make check       typecheck, prettier, ruff, pytest (run before every push)"
	@echo "make format      prettier --write + ruff fix/format"
	@echo "make test        backend tests only"
	@echo "make build       minified production frontend build"
	@echo "make prod        production stack in Docker → http://localhost:8000"
	@echo "make prod-logs   follow production container logs"
	@echo "make prod-down   stop the production stack"
	@echo "make smoke       end-to-end check of a running app (URL=... to target another)"

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
	cd frontend && npx tsc --noEmit && npx prettier --check .
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
