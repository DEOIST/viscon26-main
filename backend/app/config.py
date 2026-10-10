"""Settings read from environment variables and backend/.env (see .env.example)."""

from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_DIR / ".env", BACKEND_DIR / ".env"), extra="ignore"
    )

    app_name: str = "ETH Life"
    environment: str = "development"
    frontend_dist: Path = REPO_DIR / "frontend" / "dist"

    # Empty means an in-process fakeredis (development and tests only); required in production.
    redis_url: str = ""

    database_url: SecretStr = SecretStr("")
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5433
    postgres_db: str = "eth_simulator"
    postgres_user: str = "eth_dev"
    postgres_password: SecretStr = SecretStr("local-development-only")
    session_secret: SecretStr = SecretStr(
        "local-only-change-this-before-any-shared-use-32-characters"
    )
    cookie_secure: bool = False
    allowed_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip().rstrip("/") for part in value.split(",") if part.strip()]
        return value

    @field_validator("session_secret")
    @classmethod
    def _session_secret_length(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("SESSION_SECRET must contain at least 32 characters")
        return value

    # OpenAI, see docs/ARCHITECTURE.md → "OpenAI integration". Only app/ai.py reads these.
    ai_mode: Literal["off", "fake", "live"] = "off"
    # Comma-separated, used in order as a failover chain. SecretStr keeps them out of logs.
    openai_api_keys: Annotated[list[SecretStr], NoDecode] = []
    openai_text_model: str = "gpt-6-luna"
    openai_reasoning_effort: str = "none"  # empty: don't send it (models without reasoning)
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "cedar"
    openai_image_model: str = "gpt-image-2.5-sunburst"
    openai_timeout_seconds: float = 12.0
    ai_daily_call_limit: int = 3000

    @field_validator("openai_api_keys", mode="before")
    @classmethod
    def _split_key_list(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @model_validator(mode="after")
    def _production_needs_redis(self) -> Self:
        if self.environment == "production" and not self.redis_url:
            raise ValueError("REDIS_URL must be set when ENVIRONMENT=production")
        return self


settings = Settings()
