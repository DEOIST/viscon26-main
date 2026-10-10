"""Skin tone from the avatar photo's pixels (app/services/skin.py)."""

import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.services import skin

# Neil Armstrong's NASA portrait (public domain), cropped to webcam framing and shrunk
FACE = Path(__file__).parent / "fixtures" / "face_public_domain.jpg"
PRESETS = {preset["label"]: preset["value"] for preset in skin.SKIN_PRESETS}


def encode(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def test_every_preset_maps_back_to_itself_without_an_offset():
    for value in PRESETS.values():
        assert skin.nearest_preset(skin._rgb(value), offset=0) == value


def test_the_offset_brightens_the_measurement():
    tan = skin._rgb(PRESETS["Golden tan"])
    assert skin.nearest_preset(tan, offset=0) == PRESETS["Golden tan"]
    assert skin.nearest_preset(tan, offset=8) == PRESETS["Warm beige"]


def test_sampling_ignores_shadow_and_glare_around_the_landmarks():
    pixels = np.full((100, 100, 3), (190, 140, 110), dtype=np.uint8)
    points = np.zeros((478, 2))
    points[:, 0] = np.linspace(20, 80, 478)  # a 60 px wide "face"
    points[:, 1] = 50
    pixels[48:51, :] = (20, 15, 10)  # a shadow line through every patch
    pixels[52, 30] = (255, 255, 255)  # a glint

    assert list(skin.sample_skin(pixels, points)) == [190, 140, 110]


@pytest.mark.parametrize(
    "image",
    [b"not an image", encode(Image.new("RGB", (skin.MAX_SIDE + 1, 1)))],
    ids=["unreadable", "oversized"],
)
def test_bad_images_never_reach_mediapipe(image, monkeypatch):
    def refuse(_pixels):
        raise AssertionError("MediaPipe was called")

    monkeypatch.setattr(skin._finder, "landmarks", refuse)

    assert skin.measure_skin(image) is None


@pytest.mark.skipif(
    not any(path.is_file() for path in skin.MODEL_CANDIDATES),
    reason="face model not downloaded (`make build` downloads it)",
)
def test_the_real_model_measures_a_face_off_the_oval():
    # The face is off-centre on purpose: the fixed oval spots used to land on the background
    photo = Image.open(FACE)
    shifted = Image.new("RGB", photo.size, (30, 30, 30))
    shifted.paste(photo.crop((40, 0, photo.width, photo.height)), (0, 0))

    measurement = skin.measure_skin(encode(shifted))

    assert measurement is not None
    assert measurement.preset in (PRESETS["Light porcelain"], PRESETS["Warm beige"])
    assert measurement.lightness > 65  # skin, not the dark background
