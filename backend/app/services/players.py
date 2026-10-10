"""Anonymous profiles and idempotent shell progression, independent of HTTP."""

from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Completion, Player, Profile
from app.schemas import (
    ProfileInput,
    ScoreboardEntry,
    ShellCharacter,
    ShellPlayer,
    ShellProfile,
    ShellProgress,
)
from app.shell_config import GAMES, YEARS, can_graduate, earned_ects, year_unlocked
from app.text import TEXT


class PlayerError(Exception):
    def __init__(self, message: str, kind: str = "conflict") -> None:
        super().__init__(message)
        self.kind = kind


def database_health(db: Session) -> None:
    db.execute(text("SELECT 1"))


def get_player(db: Session, player_id: str) -> Player:
    player = db.scalar(select(Player).where(Player.anonymous_id == player_id))
    if not player:
        raise PlayerError(TEXT["errors"]["player"]["notFound"], "not_found")
    return player


def profile_data(profile: Profile | None) -> ShellProfile | None:
    if not profile:
        return None
    return ShellProfile(
        name=profile.name,
        character=ShellCharacter(
            hair_color=profile.hair_color,
            skin_color=profile.skin_color,
            eye_color=profile.eye_color,
            gender=profile.gender,
            glasses=profile.glasses,
            hair_length=profile.hair_length,
        ),
        major=profile.major,
        onboarding_stage=profile.onboarding_stage,
    )


def completion_scores(db: Session, player_id: int) -> dict[str, int | None]:
    """Completed game id → its score (None for completions saved before scores existed)."""
    rows = db.execute(
        select(Completion.game_id, Completion.score).where(Completion.player_id == player_id)
    )
    return {key: score for key, score in rows if key in GAMES and GAMES[key]["implemented"]}


def progress_data(db: Session, player: Player) -> ShellProgress:
    completed = completion_scores(db, player.id)
    graduated_at = player.graduated_at
    if graduated_at and graduated_at.tzinfo is None:
        graduated_at = graduated_at.replace(tzinfo=UTC)
    return ShellProgress(
        completed_game_ids=sorted(completed),
        scores={key: score for key, score in completed.items() if score is not None},
        graduated=player.graduated_at is not None,
        graduated_at=graduated_at,
        ects=earned_ects(completed),
    )


def player_data(db: Session, player: Player) -> ShellPlayer:
    return ShellPlayer(
        id=player.anonymous_id,
        profile=profile_data(db.get(Profile, player.id)),
        progress=progress_data(db, player),
    )


def save_profile(db: Session, player_id: str, body: ProfileInput) -> ShellPlayer:
    player = db.scalar(select(Player).where(Player.anonymous_id == player_id).with_for_update())
    if not player:
        player = Player(anonymous_id=player_id)
        db.add(player)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            # Another request may have created this run; lock its profile update as well.
            player = db.scalar(
                select(Player).where(Player.anonymous_id == player_id).with_for_update()
            )
    profile = db.get(Profile, player.id) or Profile(player_id=player.id)
    profile.name = body.name
    # All supported legacy values represent the same department; existing rows are untouched.
    profile.major = "Computer Science"
    profile.hair_color, profile.skin_color, profile.eye_color = (
        body.hair_color,
        body.skin_color,
        body.eye_color,
    )
    profile.gender, profile.glasses = body.gender, body.glasses
    profile.hair_length = body.hair_length
    profile.onboarding_stage = body.onboarding_stage
    db.add(profile)
    db.commit()
    return player_data(db, player)


def complete_game(db: Session, player: Player, game_id: str, score: int | None) -> ShellProgress:
    game = GAMES.get(game_id)
    if not game:
        raise PlayerError(TEXT["errors"]["player"]["unknownGame"], "not_found")
    if not game["implemented"]:
        raise PlayerError(TEXT["errors"]["player"]["placeholder"])
    # Refresh after taking the per-player lock, including a concurrent graduation change.
    player = db.scalar(
        select(Player)
        .where(Player.id == player.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    profile = db.get(Profile, player.id)
    if not profile or profile.onboarding_stage != "main":
        raise PlayerError(TEXT["errors"]["player"]["onboardingRequired"])
    completed = completion_scores(db, player.id)
    # The first result counts: replaying a finished game cannot improve its ECTS.
    if game_id in completed:
        return progress_data(db, player)
    if player.graduated_at:
        raise PlayerError(TEXT["errors"]["player"]["alreadyGraduated"])
    index = next(i for i, year in enumerate(YEARS) if game in year["games"])
    if not year_unlocked(index, completed):
        raise PlayerError(TEXT["errors"]["player"]["previousYearsRequired"])
    db.add(
        Completion(
            player_id=player.id, game_id=game_id, completed_at=datetime.now(UTC), score=score
        )
    )
    db.commit()
    return progress_data(db, player)


def graduate(db: Session, player: Player) -> ShellProgress:
    player = db.scalar(
        select(Player)
        .where(Player.id == player.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if player.graduated_at:
        return progress_data(db, player)
    if not can_graduate(completion_scores(db, player.id)):
        raise PlayerError(TEXT["errors"]["player"]["graduationRequirements"])
    if not player.graduated_at:
        player.graduated_at = datetime.now(UTC)
        db.commit()
    return progress_data(db, player)


def scoreboard(db: Session) -> list[ScoreboardEntry]:
    profiles = db.execute(
        select(Player, Profile).join(Profile, Profile.player_id == Player.id)
    ).all()
    completions: dict[int, dict[str, int | None]] = {}
    for player_id, game_id, score in db.execute(
        select(Completion.player_id, Completion.game_id, Completion.score)
    ):
        completions.setdefault(player_id, {})[game_id] = score
    rows = [
        (
            player.id,
            ScoreboardEntry(
                name=profile.name,
                major=profile.major,
                ects=earned_ects(completions.get(player.id, {})),
                graduated=player.graduated_at is not None,
            ),
        )
        for player, profile in profiles
    ]
    rows.sort(key=lambda row: (-row[1].ects, row[0]))
    return [row for _, row in rows[:100]]
