"""Suggest character colors from a webcam photo (the AI avatar creator, issue #19).

The model answers with preset labels; this maps them to the preset hex values that
ProfileInput accepts. Skin is measured in the browser from the photo's pixels, not asked of the
model (it drifts toward one middle tone). When the AI is off or fails, the suggestion is empty
(source="fallback") and the player just picks swatches by hand. Photos are never stored or logged.
"""

from app import ai, prompts
from app.game_config import CONFIG
from app.schemas import AvatarSuggestion

_HEX = {
    group: {color["label"]: color["value"] for color in CONFIG["colors"][group]}
    for group in ("hair", "eyes")
}


def suggest_from_photo(image_url: str) -> AvatarSuggestion:
    if ai.mode() == "fake":
        # Canned answer without a call, for building the UI
        return AvatarSuggestion(
            hair_color=CONFIG["colors"]["hair"][1]["value"],
            eye_color=CONFIG["colors"]["eyes"][0]["value"],
            glasses="none",
            gender="unclear",
            source="ai",
        )
    try:
        traits = ai.generate_structured_from_image(
            prompts.AVATAR_INSTRUCTIONS,
            prompts.AVATAR_PROMPT,
            image_url,
            prompts.AvatarTraits,
            max_output_tokens=120,
        )
    except ai.AiUnavailableError:
        return AvatarSuggestion(source="fallback")
    return AvatarSuggestion(
        hair_color=_HEX["hair"][traits.hair_color],
        eye_color=_HEX["eyes"][traits.eye_color],
        glasses=traits.glasses,
        gender=traits.gender,
        source="ai",
    )
