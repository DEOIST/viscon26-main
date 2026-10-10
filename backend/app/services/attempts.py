"""Attempt history and the activity graph for signed-in players, independent of HTTP."""

from collections import Counter
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import Attempt as AttemptRow
from app.database import User
from app.schemas import ActivityDay, ActivitySummary, Attempt, AttemptInput
from app.services.accounts import AccountError, completed_ids
from app.shell_config import GAMES, YEARS, year_unlocked

GRAPH_DAYS = 53 * 7  # a full year of week columns, like GitHub's and monkeytype's graphs
# Far above honest play (a round takes a minute or more); stops a scripted client from filling
# the table. Scores are client-reported anyway, so this is about storage, not cheating.
DAILY_LIMIT = 300


def as_utc(moment: datetime) -> datetime:
    """SQLite hands back naive datetimes; everything we store is UTC."""
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def attempt_data(row: AttemptRow) -> Attempt:
    return Attempt(
        id=row.id, game_id=row.game_id, score=row.score, finished_at=as_utc(row.finished_at)
    )


def record_attempt(db: Session, user: User, body: AttemptInput) -> Attempt:
    game = GAMES.get(body.game_id)
    if not game:
        raise AccountError("Unknown minigame.", "not_found")
    if not game["implemented"]:
        raise AccountError("Placeholder previews are not recorded.")
    index = next(i for i, year in enumerate(YEARS) if game in year["games"])
    if not year_unlocked(index, completed_ids(db, user.id)):
        raise AccountError("Complete every minigame in the previous years first.")
    now = datetime.now(UTC)
    recent = db.scalar(
        select(func.count())
        .select_from(AttemptRow)
        .where(AttemptRow.user_id == user.id, AttemptRow.finished_at > now - timedelta(days=1))
    )
    if recent >= DAILY_LIMIT:
        raise AccountError("That is a lot of rounds for one day. Come back tomorrow.", "too_many")
    row = AttemptRow(user_id=user.id, game_id=body.game_id, score=body.score, finished_at=now)
    db.add(row)
    db.commit()
    return attempt_data(row)


def list_attempts(db: Session, user: User, limit: int) -> list[Attempt]:
    rows = db.scalars(
        select(AttemptRow)
        .where(AttemptRow.user_id == user.id)
        .order_by(AttemptRow.finished_at.desc(), AttemptRow.id.desc())
        .limit(limit)
    )
    return [attempt_data(row) for row in rows]


def streaks(played: set[date], today: date) -> tuple[int, int]:
    """(current, longest). A streak survives until a full day passes without a round."""
    longest = 0
    for day in played:
        if day - timedelta(days=1) not in played:  # the first day of a run
            length = 1
            while day + timedelta(days=length) in played:
                length += 1
            longest = max(longest, length)
    current = 0
    day = today if today in played else today - timedelta(days=1)
    while day in played:
        current += 1
        day -= timedelta(days=1)
    return current, longest


def get_activity(db: Session, user: User, tz: str) -> ActivitySummary:
    zone = ZoneInfo(tz)
    today = datetime.now(zone).date()
    rows = db.execute(
        select(AttemptRow.game_id, AttemptRow.score, AttemptRow.finished_at).where(
            AttemptRow.user_id == user.id
        )
    ).all()
    per_day = Counter(as_utc(finished_at).astimezone(zone).date() for _, _, finished_at in rows)
    best_scores: dict[str, int] = {}
    for game_id, score, _ in rows:
        best_scores[game_id] = max(best_scores.get(game_id, 0), score)
    first = today - timedelta(days=GRAPH_DAYS - 1)
    current, longest = streaks(set(per_day), today)
    return ActivitySummary(
        today=today,
        days=[
            ActivityDay(day=day, attempts=count)
            for day, count in sorted(per_day.items())
            if first <= day <= today
        ],
        total_attempts=len(rows),
        active_days=len(per_day),
        current_streak=current,
        longest_streak=longest,
        best_scores=best_scores,
    )
