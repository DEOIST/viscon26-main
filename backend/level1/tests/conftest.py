"""The app's shared fixtures (tests/conftest.py): fakeredis, AI off, no network, and `client`."""

import pytest

from level1 import cv as cv_service
from level1.gesture import PlayerGun
from tests.conftest import client, isolated  # noqa: F401  (pytest finds fixtures by name)


@pytest.fixture
def legacy_thumb_trigger(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep historical thumb-drop assertions intact, with the old trigger explicitly enabled.
    Live sessions always use recoil; this Python-only mode replays the labeled old recordings."""
    monkeypatch.setattr(cv_service, "PlayerGun", lambda: PlayerGun(trigger="thumb"))
