"""Pre-written story content for when the AI can't answer (AI_MODE=off, outage, cap).

Templated with the character, so even the fallback feels personal. `{name}` and `{department}`
are the only placeholders; names can't contain braces (schemas.CharacterName).
"""

import random

from app.prompts import DEPARTMENT_NAMES, DIALOGUE_EVENTS
from app.schemas import DialogueScene, EndingId, Run
from level2 import dialogue as level2_dialogue

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
    "blackjack": level2_dialogue.FALLBACK_LINES,  # level 2 (backend/level2/)
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
    },
}

_EPILOGUES: dict[EndingId, str] = {
    "quant": (
        "{name} took {department} to a hedge fund in Zug and now predicts markets with the same "
        "confidence once reserved for counting cards at casino night. The models are "
        "stochastic, the bonus is not, and the blackboard has not been wiped since 2026."
    ),
    "phd": (
        "{name} stayed in {department} for a PhD. It is year seven, the supervisor wants "
        '"one more paper", the coffee machine knows {name} by name, and the thesis is '
        '"basically done". The doctoral hat is already being glued together from pizza boxes.'
    ),
    "masters": (
        "{name} finished the bachelor in {department} and walked straight back up the steps of "
        "the main building for a Master's. Same lecture halls, same Mensa queue, new excuse: "
        '"the job market will be better in two years".'
    ),
    "mcdonalds": (
        "{name} graduated in {department} and now runs the fastest fryer at the McDonald's at "
        "Zürich HB. The throughput is legendary, and the diploma hangs proudly next to the "
        "ice-cream machine that never works."
    ),
    "homeless": (
        "{name} graduated in {department} and lost the Zürich housing lottery: 400 applications, "
        "zero viewings. {name} now lives between the Polyterrasse and the night tram, holding "
        "a cardboard CV that says HELP, and still answers every email within the hour."
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
    ending_id: EndingId = run.ending.id if run.ending else "homeless"
    return _fill(_EPILOGUES[ending_id], run)


def _fill(template: str, run: Run) -> str:
    return template.format(
        name=run.character.name, department=DEPARTMENT_NAMES[run.character.department]
    )


# --- companion ---

# When the AI is off or fails, the dealer still answers, honestly and in character.
COMPANION_OFFLINE = (
    "The dealer taps the felt and says nothing. Chatty mode is offline, {name}; deal again.",
    "Not tonight, {name}. My clever lines are on strike, but the cards still work.",
    "I would answer, {name}, but my speechwriter is out of credit. Place your bet.",
)
COMPANION_DECLINE = "Let's keep it about the cards, {name}. The house has rules, and so do I."


def companion_offline(name: str) -> str:
    return random.choice(COMPANION_OFFLINE).format(name=name)


def companion_decline(name: str) -> str:
    return COMPANION_DECLINE.format(name=name)


def companion_fake(question: str) -> str:
    """AI_MODE=fake: shows the round trip without a call."""
    return f'(Fake AI) You asked: "{question}". The house thanks you for your curiosity.'
