import pytest
from pydantic import ValidationError

from app.config import Settings


def test_openai_keys_are_parsed_from_a_comma_separated_list(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENAI_API_KEYS", " sk-one , sk-two,, ")

    keys = Settings(_env_file=None).openai_api_keys

    assert [key.get_secret_value() for key in keys] == ["sk-one", "sk-two"]


def test_missing_openai_keys_mean_an_empty_chain(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("OPENAI_API_KEYS", raising=False)

    assert Settings(_env_file=None).openai_api_keys == []


def test_keys_never_appear_in_the_settings_repr(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENAI_API_KEYS", "sk-very-secret-value")

    assert "sk-very-secret-value" not in repr(Settings(_env_file=None))


def test_production_refuses_to_start_without_redis(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("REDIS_URL", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_unknown_ai_mode_is_rejected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_MODE", "turbo")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_graduation_preview_defaults_to_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GRADUATION_PREVIEW", raising=False)

    assert Settings(_env_file=None).graduation_preview is False


@pytest.mark.parametrize(
    "value, enabled", [("on", True), ("off", False), ("true", True), ("false", False)]
)
def test_graduation_preview_parses_environment_switch(
    monkeypatch: pytest.MonkeyPatch, value: str, enabled: bool
) -> None:
    monkeypatch.setenv("GRADUATION_PREVIEW", value)

    assert Settings(_env_file=None).graduation_preview is enabled
