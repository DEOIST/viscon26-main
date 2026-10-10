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


def dialogue_key(run_id: str, scene: str, stage: int) -> str:
    return f"story:dialogue:{run_id}:{scene}:{stage}"


def epilogue_key(run_id: str) -> str:
    return f"story:epilogue:{run_id}"


def speech_key(run_id: str) -> str:
    return f"story:speech:{run_id}"


def ai_calls_key(day: str) -> str:
    return f"ai:calls:{day}"


def dead_key_flag(index: int) -> str:
    """Marks key number `index` of the chain as unusable. Never stores the key itself."""
    return f"ai:key:{index}:dead"


def companion_history_key(player_id: str) -> str:
    return f"companion:history:{player_id}"


def companion_asks_key(player_id: str, hour: str) -> str:
    return f"companion:asks:{player_id}:{hour}"


def companion_speech_key(text_hash: str) -> str:
    return f"companion:speech:{text_hash}"


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
