"""The engine's settings, read like app/config.py from the environment and .env (CV_* names, see
backend/.env.example)."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.config import BACKEND_DIR, REPO_DIR

MODEL_NAME = "hand_landmarker.task"
# The frontend build downloads the hand model into public/models/ and copies it into the built
# dist/ (the production image only has dist/); development without a build reads public/.
MODEL_CANDIDATES = (
    REPO_DIR / "frontend" / "dist" / "static" / "models" / MODEL_NAME,
    REPO_DIR / "frontend" / "public" / "models" / MODEL_NAME,
)


def _default_model_path() -> Path:
    return next((path for path in MODEL_CANDIDATES if path.is_file()), MODEL_CANDIDATES[0])


class CvSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CV_", env_file=(REPO_DIR / ".env", BACKEND_DIR / ".env"), extra="ignore"
    )

    model_path: Path = _default_model_path()
    max_sessions: int = 4  # players tracked at the same time; each costs ~1 CPU core
    max_frame_bytes: int = 200_000  # a 640×480 camera JPEG is ~30–60 KB
    idle_timeout_seconds: float = 20.0  # a hidden tab sends nothing: free its slot


cv_settings = CvSettings()
