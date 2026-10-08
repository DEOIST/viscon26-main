from fastapi import APIRouter

from app.config import settings
from app.schemas import HealthStatus

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def get_health() -> HealthStatus:
    return HealthStatus(status="ok", environment=settings.environment)
