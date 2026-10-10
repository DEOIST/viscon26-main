"""Pre-written story content for when the AI can't answer (AI_MODE=off, outage, cap).

Templated with the character, so even the fallback feels personal. `{name}` and `{department}`
are the only placeholders; names can't contain braces (schemas.CharacterName).
"""

from app.prompts import DEPARTMENT_NAMES, DIALOGUE_EVENTS
from app.schemas import DialogueScene, EndingId, Run
from app.text import TEXT
from level2 import dialogue as level2_dialogue

# Advisor stages and scene event keys remain the same; only copy lives in the shared catalog.
_ADVISOR_BY_STAGE = TEXT["story"]["advisorByStage"]
_SCENE_LINES = {
    "blackjack": level2_dialogue.FALLBACK_LINES,
    "shooter": TEXT["story"]["shooter"],
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
    return _fill(TEXT["endings"][ending_id]["epilogue"], run)


def _fill(template: str, run: Run) -> str:
    return template.format(
        name=run.character.name, department=DEPARTMENT_NAMES[run.character.department]
    )
