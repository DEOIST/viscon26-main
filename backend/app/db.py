"""The one Redis client, and every key pattern we store (docs/ARCHITECTURE.md → Redis data model).

Services call `get_redis()`; nothing else creates a client. With an empty REDIS_URL (development
without Docker, and every test) the client is an in-process fakeredis whose data lives only as
long as the process.
"""

from functools import lru_cache

import redis

from app.config import settings

LEADERBOARD = "leaderboard"  # sorted set: run id → total score
ENDING_COUNTS = "endings:count"  # hash: ending id → number of graduations


def run_key(run_id: str) -> str:
    return f"run:{run_id}"


@lru_cache
def get_redis() -> redis.Redis:
    if settings.redis_url:
        return redis.Redis.from_url(
            settings.redis_url, decode_responses=True, socket_connect_timeout=5, socket_timeout=5
        )
    if settings.environment == "production":
        raise RuntimeError("REDIS_URL is required in production")
    import fakeredis  # development-only dependency (requirements-dev.txt)

    return fakeredis.FakeRedis(server=fakeredis.FakeServer(), decode_responses=True)
