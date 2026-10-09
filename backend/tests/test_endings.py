import pytest

from app.services.endings import decide_ending, total_score


@pytest.mark.parametrize(
    ("total", "ending_id"),
    [
        (0, "unemployed"),
        (24, "unemployed"),
        (25, "mcdonalds"),
        (44, "mcdonalds"),
        (45, "phd"),
        (64, "phd"),
        (65, "big_tech"),
        (84, "big_tech"),
        (85, "c_level"),
        (100, "c_level"),
    ],
)
def test_each_tier_starts_exactly_at_its_threshold(total: int, ending_id: str):
    assert decide_ending(total).id == ending_id


def test_total_score_rounds_half_up_not_to_even():
    assert total_score({"blackjack": 84, "shooter": 85}) == 85
    assert total_score({"blackjack": 0, "shooter": 1}) == 1
