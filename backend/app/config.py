"""Settings read from environment variables and backend/.env (see .env.example)."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    app_name: str = "Hackathon App"
    environment: str = "development"
    frontend_dist: Path = REPO_DIR / "frontend" / "dist"


settings = Settings()
