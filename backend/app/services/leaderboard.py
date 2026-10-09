"""Hall of Fame: graduated runs ranked by total score, and how often each ending happened."""

from typing import get_args

from app import db
from app.schemas import EndingId, EndingStats, LeaderboardEntry, Run


def list_leaderboard(limit: int) -> list[LeaderboardEntry]:
    client = db.get_redis()
    run_ids = client.zrevrange(db.LEADERBOARD, 0, limit - 1)
    if not run_ids:
        return []
    entries = []
    for raw in client.mget([db.run_key(run_id) for run_id in run_ids]):
        if raw is None:
            continue
        run = Run.model_validate_json(raw)
        if run.ending is None or run.total_score is None or run.graduated_at is None:
            continue
        entries.append(
            LeaderboardEntry(
                run_id=run.id,
                name=run.character.name,
                avatar=run.character.avatar,
                department=run.character.department,
                total_score=run.total_score,
                ending_id=run.ending.id,
                graduated_at=run.graduated_at,
            )
        )
    return entries


def get_ending_stats() -> EndingStats:
    stored = db.get_redis().hgetall(db.ENDING_COUNTS)
    counts = {ending: int(stored.get(ending, 0)) for ending in get_args(EndingId)}
    return EndingStats(total=sum(counts.values()), counts=counts)
