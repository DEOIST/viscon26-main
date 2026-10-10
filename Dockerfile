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

COPY frontend/ ./
RUN node build.js --prod

# --- Stage 2: runtime --------------------------------------------------------------------
FROM public.ecr.aws/docker/library/python:3.14-slim

# MPLCONFIGDIR: matplotlib (pulled in by MediaPipe) needs a writable cache, and appuser has no
# home directory.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ENVIRONMENT=production \
    MPLCONFIGDIR=/tmp/matplotlib

WORKDIR /app/backend

# The finger-detection engine (MediaPipe, issue #13) needs these system libraries even though the
# server never opens a window: OpenCV's import needs libxcb1, libgl1 and libglib2.0-0, and
# MediaPipe's native library needs libegl1 and libgles2 when the hand detector starts. Found by
# starting the detector as appuser in this exact base image; /api/cv/status checks the same.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libxcb1 libgl1 libglib2.0-0 libegl1 libgles2 \
    && rm -rf /var/lib/apt/lists/*

# Runtime deps only (no pytest/ruff).
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist

RUN useradd --system --no-create-home appuser
USER appuser

EXPOSE 8000

# --start-interval: probe every 2 s while starting, so `docker compose up --wait` returns quickly.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"]

# One worker on purpose: in-process state is per worker (the finger-detection engine's session
# count, see CLAUDE.md → Gotchas). --ws-max-size: a WebSocket message (a camera frame) is at most
# CV_MAX_FRAME_BYTES (200 KB); 1 MiB instead of uvicorn's 16 MiB default keeps oversized messages
# from ever being buffered. Keep it above CV_MAX_FRAME_BYTES.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--ws-max-size", "1048576"]
