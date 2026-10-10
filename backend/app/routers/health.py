from fastapi import APIRouter

from app.config import settings
from app.schemas import HealthStatus, PublicConfig

router = APIRouter(tags=["health"])


@router.get("/health")
def get_health() -> HealthStatus:
    return HealthStatus(status="ok", environment=settings.environment)


@router.get("/config")
def get_public_config() -> PublicConfig:
    return PublicConfig(graduation_preview=settings.graduation_preview)
