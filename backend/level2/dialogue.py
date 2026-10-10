"""The dealer's dialogue for Galton Blackjack: the event keys the game looks up
(frontend/level2/lines.ts), who speaks (for the AI prompt), and the pre-written lines for when
the AI can't answer.

`{name}` and `{department}` are the only placeholders; app/services/fallbacks.py fills them in.
"""

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
    "intro": (
        "Welcome to casino night, {name}. Your stipend looks nervous.",
        "Place your bets. The house always wins, but who's counting?",
    ),
    "deal": ("Cards are out. Try to look confident.", "Fresh cards, fresh regrets."),
    "playerBlackjack": (
        "Blackjack! Somebody tell the Mensa, {name} is buying.",
        "Three yellow balls. Even the dealer is impressed.",
    ),
    "playerBust": (
        "Bust. A very {department} way to lose.",
        "Over the curve, like your weekly lecture hours.",
    ),
    "dealerBust": ("I busted. Don't tell my professor.", "Dealer busts. Enjoy it."),
    "win": (
        "You win this round. Don't spend it all at the Mensa.",
        "A win! Your stipend breathes again.",
    ),
    "lose": ("The house wins. The house always wins.", "That hurt, like a Basisprüfung."),
    "push": ("A push. Nobody wins, like group projects.", "A tie. Perfectly pointless."),
    "broke": (
        "Out of money, {name}. Welcome to student life.",
        "Your stipend is gone. So is your dignity.",
    ),
    "cashOut": (
        "Cashing out? Smartest move all semester.",
        "Leaving while ahead. That should be worth ECTS.",
    ),
}
