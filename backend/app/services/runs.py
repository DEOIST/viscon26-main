"""Runs: one player's journey from enrollment to graduation, stored in Redis as JSON."""

from datetime import UTC, datetime
from uuid import uuid4

import redis

from app import ai, db
from app.game_config import GAMES, earned_ects
from app.schemas import Run, RunWHid, ScoreSubmission
from app.services.endings import decide_ending, total_score


class RunStateError(Exception):
    """The run exists, but the action doesn't fit its state (the router answers 409)."""


class NameRejectedError(Exception):
    """Moderation flagged the character name (the router answers 422)."""


def create_run(payload: RunWHid) -> Run:
    if _name_is_flagged(payload.character.name):
        raise NameRejectedError
    run = Run(id=uuid4().hex, created_at=datetime.now(UTC), **payload.model_dump())
    db.get_redis().set(db.run_key(run.id), run.model_dump_json())
    return run


def get_run_by_id(run_id: str) -> Run | None:
    raw = db.get_redis().get(db.run_key(run_id))
    return Run.model_validate_json(raw) if raw else None


def submit_score(run_id: str, payload: ScoreSubmission) -> Run | None:
    """WATCH prevents simultaneous independent completions or graduation from losing state."""
    with db.get_redis().pipeline() as pipe:
        while True:
            try:
                pipe.watch(db.run_key(run_id))
                raw = pipe.get(db.run_key(run_id))
                if raw is None:
                    return None
                run = Run.model_validate_json(raw)
                if run.ending is not None:
                    raise RunStateError("This run has already graduated")
                if not GAMES[payload.game]["implemented"]:
                    raise RunStateError("Preview minigames cannot award scores or ECTS")
                scores = {**run.scores, payload.game: payload.score}
                updated = run.model_copy(
                    update={
                        "scores": scores,
                        "completed_game_ids": [game for game in GAMES if game in scores],
                        "ects_points": earned_ects(scores),
                    }
                )
                pipe.multi()
                pipe.set(db.run_key(run_id), updated.model_dump_json())
                pipe.execute()
                return updated
            except redis.WatchError:
                continue


def graduate_run(run_id: str) -> Run | None:
    """Fix the total and the ending once; calling it again returns the graduated run unchanged.

    WATCH makes a double click count once: if another request graduates the run between our
    read and our write, the transaction is retried and sees the graduated run.
    """
    with db.get_redis().pipeline() as pipe:
        while True:
            try:
                pipe.watch(db.run_key(run_id))
                raw = pipe.get(db.run_key(run_id))
                if raw is None:
                    return None
                run = Run.model_validate_json(raw)
                if run.ending is not None:
                    return run
                missing = [
                    game
                    for game in GAMES
                    if game not in run.scores or not GAMES[game]["implemented"]
                ]
                if missing:
                    raise RunStateError(f"Play {' and '.join(missing)} before graduating")
                total = total_score(run.scores)
                graduated = run.model_copy(
                    update={
                        "total_score": total,
                        "ending": decide_ending(total),
                        "graduated_at": datetime.now(UTC),
                    }
                )
                pipe.multi()
                pipe.set(db.run_key(run_id), graduated.model_dump_json())
                pipe.zadd(db.LEADERBOARD, {run_id: total})
                pipe.hincrby(db.ENDING_COUNTS, graduated.ending.id, 1)
                pipe.execute()
                return graduated
            except redis.WatchError:
                continue


def _name_is_flagged(name: str) -> bool:
    """Moderation runs only in live AI mode, and fails open: an outage must not block enrolling."""
    try:
        return ai.moderate(name)
    except ai.AiUnavailableError:
        return False
