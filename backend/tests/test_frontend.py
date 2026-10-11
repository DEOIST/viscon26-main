"""Serving the frontend build: game assets must reach the browser with their real media types."""

import mimetypes

import pytest

import app.frontend  # noqa: F401  (registers the media types)


@pytest.mark.parametrize(
    ("filename", "media_type"),
    [
        ("strange-menu.ogg", "audio/ogg"),
        ("theme.m4a", "audio/mp4"),
        ("year1.webp", "image/webp"),
        ("font.woff2", "font/woff2"),
    ],
)
def test_game_assets_have_media_types(filename: str, media_type: str) -> None:
    assert mimetypes.guess_type(filename)[0] == media_type
