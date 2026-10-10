"""Suggest character colors from a webcam photo (the AI avatar creator, issue #19).

The model answers with preset labels; this maps them to the preset hex values that
ProfileInput accepts. Skin is measured from the photo's pixels on the face the face landmarker
finds (services/skin.py), never asked of the model (it drifts toward one middle tone), so it is
filled in even when the AI is off or fails. Without the AI the other fields are empty
(source="fallback") and the player picks them by hand. Photos are never stored or logged.
"""

import base64
import binascii

from app import ai, prompts
from app.game_config import CONFIG
from app.schemas import AvatarSuggestion
from app.services import skin

_HEX = {
    group: {color["label"]: color["value"] for color in CONFIG["colors"][group]}
    for group in ("hair", "eyes")
}


def _measured_skin(image_url: str) -> str | None:
    try:
        image = base64.b64decode(image_url.split(",", 1)[1], validate=True)
    except (IndexError, binascii.Error):
        return None
    measurement = skin.measure_skin(image)
    return measurement.preset if measurement else None


def suggest_from_photo(image_url: str) -> AvatarSuggestion:
    skin_color = _measured_skin(image_url)
    if ai.mode() == "fake":
        # Canned answer without a call, for building the UI
        return AvatarSuggestion(
            hair_color=CONFIG["colors"]["hair"][1]["value"],
            skin_color=skin_color,
            hair_length="short",
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
        return AvatarSuggestion(skin_color=skin_color, source="fallback")
    return AvatarSuggestion(
        hair_color=_HEX["hair"][traits.hair_color],
        skin_color=skin_color,
        hair_length=traits.hair_length,
        eye_color=_HEX["eyes"][traits.eye_color],
        glasses=traits.glasses,
        gender=traits.gender,
        source="ai",
    )
