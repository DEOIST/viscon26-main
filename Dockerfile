# Backend-only development target and complete production image for existing CD.
FROM public.ecr.aws/docker/library/node:26-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci
COPY shared/ /app/shared/
COPY frontend/ ./
RUN npm run build

FROM public.ecr.aws/docker/library/python:3.12-slim AS backend
# MPLCONFIGDIR: matplotlib (pulled in by MediaPipe, level 1) needs a writable cache, and appuser
# has no home directory.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MPLCONFIGDIR=/tmp/matplotlib
WORKDIR /app/backend
# Level 1's finger-detection engine (MediaPipe) needs these even without a screen: libxcb1,
# libgl1 and libglib2.0-0 to import OpenCV, libegl1 and libgles2 when a hand detector starts.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libxcb1 libgl1 libglib2.0-0 libegl1 libgles2 \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY shared/ /app/shared/
COPY backend/app ./app
COPY backend/level1 ./level1
RUN useradd --system --no-create-home appuser
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=12 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/db-health', timeout=2)"]
# One worker: the finger-detection engine's session count is per process. --ws-max-size: a camera
# frame is at most CV_MAX_FRAME_BYTES (200 KB); 1 MiB instead of uvicorn's 16 MiB keeps oversized
# messages from ever being buffered. Keep it above CV_MAX_FRAME_BYTES.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--ws-max-size", "1048576"]

FROM backend AS production
ENV ENVIRONMENT=production
COPY --from=frontend /app/frontend/dist /app/frontend/dist
