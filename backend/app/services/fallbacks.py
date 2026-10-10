"""Pre-written story content for when the AI can't answer (AI_MODE=off, outage, cap).

Templated with the character, so even the fallback feels personal. `{name}` and `{department}`
are the only placeholders; names can't contain braces (schemas.CharacterName).
"""

from app.prompts import DEPARTMENT_NAMES, DIALOGUE_EVENTS
from app.schemas import DialogueScene, EndingId, Run

# The advisor's three lines depend on how many minigames are finished.
_ADVISOR_BY_STAGE: tuple[tuple[str, ...], ...] = (
    (
        "Welcome to ETH, {name}! I'm Dr. Gradient, your study advisor.",
        "{department} is a fine choice. Mostly.",
        "Two challenges stand between you and a diploma. Pick one.",
    ),
    (
        "One down, {name}. The Polyterrasse is proud of you.",
        "Don't get comfortable: the second challenge is waiting.",
        "Remember: sleep is optional, ECTS are not.",
    ),
    (
        "{name}, you survived both challenges. I'm almost impressed.",
        "The rector is already warming up the microphone.",
        "Go and graduate before anyone checks your grades.",
    ),
)

_SCENE_LINES: dict[DialogueScene, dict[str, tuple[str, ...]]] = {
    "blackjack": {
        "intro": (
            "Welcome to casino night, {name}. Your stipend looks nervous.",
            "Place your bets. The house always wins, but who's counting?",
        ),
        "deal": ("Cards are out. Try to look confident.", "Fresh cards, fresh regrets."),
        "playerBlackjack": (
            "Blackjack! Somebody tell the Mensa, {name} is buying.",
            "Twenty-one. Even the dealer is impressed.",
        ),
        "playerBust": (
            "Bust. A very {department} way to lose.",
            "Over 21, like your weekly lecture hours.",
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
    },
    "shooter": {
        "intro": (
            "Basisprüfung time, {name}. Questions incoming. Shoot them down!",
            "Finger gun ready? The exam won't wait.",
        ),
        "streak": ("What a streak! The professors are worried.", "On fire! Open a window."),
        "miss": ("Missed. That question will haunt you.", "Aim for the paper, not the ceiling."),
        "halfway": ("Halfway there. Keep that finger steady.", "Half done. The hard half is next."),
        "boss": ("Here comes Analysis I. Good luck.", "The final boss of first year. Don't blink."),
        "end": (
            "Pens down! The exam is over.",
            "Time's up, {name}. Results in six to eight weeks.",
        ),
        # Printed on the flying targets: at most prompts.MAX_QUESTION_LENGTH characters.
        "questions": (
            "Prove that 1 + 1 = 2.",
            "Is P equal to NP? Explain.",
            "Derive the Mensa menu.",
            "Integrate e^x without crying.",
            "What is a monad? (2 points)",
            "Define 'ECTS' in one word.",
            "Name three free study spots.",
            "Solve for x. Show your work.",
            "Big-O of a group project?",
            "Why {department}? Discuss.",
        ),
    },
}

_EPILOGUES: dict[EndingId, str] = {
    "c_level": (
        "{name} left {department} and became a C-level executive within a year. {name} now "
        'flies to Davos, says "synergy" without irony and calls the casino night "strategic '
        'risk management". ETH sends its regards, and a donation request.'
    ),
    "big_tech": (
        "{name} took {department} straight to a big-tech office in Zürich: free lunch, a nap "
        "pod and three reorganisations per quarter. {name} still dreams of the Basisprüfung, but "
        "now gets paid to attend meetings about meetings."
    ),
    "phd": (
        "{name} stayed in {department} for a PhD. It is year seven, the supervisor wants "
        '"one more paper", the coffee machine knows {name} by name, and the thesis is '
        '"basically done".'
    ),
    "mcdonalds": (
        "{name} graduated in {department} and now runs the fastest fryer at the McDonald's at "
        "Zürich HB. The throughput is legendary, and the diploma hangs proudly next to the "
        "ice-cream machine that never works."
    ),
    "unemployed": (
        "{name} graduated in {department} and is still looking for a job, and for a flat. The "
        'six-person WG is cozy, the CV is long, and the LinkedIn headline says "open to '
        'opportunities". Any day now.'
    ),
}


def dialogue_lines(run: Run, scene: DialogueScene) -> dict[str, list[str]]:
    if scene == "campus":
        stage = min(len(run.scores), len(_ADVISOR_BY_STAGE) - 1)
        templates = {"advisor": _ADVISOR_BY_STAGE[stage]}
    else:
        templates = _SCENE_LINES[scene]
    return {
        event: [_fill(line, run) for line in templates[event]] for event in DIALOGUE_EVENTS[scene]
    }


def epilogue_text(run: Run) -> str:
    ending_id: EndingId = run.ending.id if run.ending else "unemployed"
    return _fill(_EPILOGUES[ending_id], run)


def _fill(template: str, run: Run) -> str:
    return template.format(
        name=run.character.name, department=DEPARTMENT_NAMES[run.character.department]
    )
