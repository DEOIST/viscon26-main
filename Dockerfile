# Production image: stage 1 builds the frontend, stage 2 runs FastAPI, which serves both the
# API and the built pages. The layout inside the image mirrors the repo (/app/backend,
# /app/frontend/dist), so app/config.py finds the frontend without extra configuration.
#
# Base images come from AWS ECR Public's mirror of the Docker Official Images (same digests as
# Docker Hub). Docker Hub rate-limits anonymous pulls per IP, and shared IPs (CI runners, the
# event network) hit that limit. For the same reason there is no `# syntax=` line: it would
# pull the Dockerfile frontend from Docker Hub on every build.

# --- Stage 1: frontend build -------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:26-alpine AS frontend
WORKDIR /app/frontend

# Install deps first so this layer is cached until package*.json changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY shared/ /app/shared/
COPY frontend/ ./
RUN node build.js --prod

# --- Stage 2: runtime --------------------------------------------------------------------
FROM public.ecr.aws/docker/library/python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ENVIRONMENT=production

WORKDIR /app/backend

# Runtime deps only (no pytest/ruff).
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY shared/ /app/shared/
COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist

RUN useradd --system --no-create-home appuser
USER appuser

EXPOSE 8000

# --start-interval: probe every 2 s while starting, so `docker compose up --wait` returns quickly.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"]

# One worker on purpose: in-memory state (the example store) is per process, so several
# workers would each see different data. Raise --workers only once state lives in a database.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
