"""The dealer's dialogue for Galton Blackjack: the event keys the game looks up
(frontend/level2/lines.ts), who speaks (for the AI prompt), and the pre-written lines for when
the AI can't answer.

`{name}` and `{department}` are the only placeholders; app/services/fallbacks.py fills them in.
"""

from app.text import TEXT

EVENTS: tuple[str, ...] = (
    "intro",
    "deal",
    "playerBlackjack",
    "playerBust",
    "dealerBust",
    "win",
    "lose",
    "push",
    "broke",
    "cashOut",
)

# Galton Blackjack has no card totals, so the model is told the rules and to stay off "21".
SPEAKER = (
    "the casino dealer at the player's Galton blackjack table, where every card drops balls "
    "onto a Galton board: a red ball above the curve busts, three yellow balls on the curve "
    "are a blackjack, otherwise more balls wins (never mention 21 or card totals)"
)

FALLBACK_LINES: dict[str, tuple[str, ...]] = {
    event: tuple(lines) for event, lines in TEXT["story"]["blackjack"].items()
}
