import math

import pytest

from app.services.gesture import (
    GestureConfig,
    GestureTracker,
    is_finger_gun,
    joint_angle,
    pick_hand,
    to_game_area,
)
from tests.hands import make_hand

# No smoothing, so tests can check exact positions; the filter has its own test.
RAW = GestureConfig(min_cutoff=math.inf, beta=0.0)
FRAME_MS = 33


def test_joint_angle_is_180_for_a_straight_line_and_90_for_a_corner():
    assert joint_angle((0, 0, 0), (0, 1, 0), (0, 2, 0)) == pytest.approx(180)
    assert joint_angle((0, 0, 0), (0, 1, 0), (1, 1, 0)) == pytest.approx(90)


@pytest.mark.parametrize(
    ("fingers", "expected"),
    [
        ({}, True),  # index straight, the other three curled
        ({"middle": True}, True),  # two of three curled is enough
        ({"middle": True, "ring": True}, False),  # only one curled
        ({"index": False}, False),  # fist
        ({"middle": True, "ring": True, "pinky": True}, False),  # open hand
    ],
)
def test_finger_gun_pose(fingers: dict[str, bool], expected: bool):
    assert is_finger_gun(make_hand(**fingers).world) is expected


def test_the_calibration_box_maps_to_the_game_area_and_x_is_mirrored():
    box = (0.2, 0.15, 0.8, 0.75)

    assert to_game_area((0.8, 0.15), box) == pytest.approx((0.0, 0.0))  # camera right = screen left
    assert to_game_area((0.5, 0.45), box) == pytest.approx((0.5, 0.5))
    assert to_game_area((0.05, 0.95), box) == pytest.approx((1.0, 1.0))  # clamped


def test_the_closest_hand_is_chosen():
    far = make_hand(size=0.08)
    near = make_hand(size=0.2)

    assert pick_hand([far, near]) is near
    assert pick_hand([]) is None


def _feed(tracker: GestureTracker, hands, start_ms: float = 0):
    """Feed hands at camera rate; returns the frames."""
    return [tracker.update(hand, start_ms + i * FRAME_MS) for i, hand in enumerate(hands)]


def test_aiming_starts_only_after_three_frames_in_pose():
    frames = _feed(GestureTracker(RAW), [make_hand()] * 3)

    assert [frame.tracking for frame in frames] == ["noPose", "noPose", "ok"]
    assert frames[2].aim == pytest.approx((0.5, 0.5))


def test_dropping_the_thumb_fires_exactly_once():
    hands = [make_hand(thumb_up=True)] * 4 + [make_hand(thumb_up=False)] * 4

    frames = _feed(GestureTracker(RAW), hands)

    assert [frame.fired_at is not None for frame in frames].count(True) == 1
    assert frames[4].fired_at is not None


def test_the_thumb_must_go_back_up_before_the_next_shot():
    cycle = [make_hand(thumb_up=True)] * 4 + [make_hand(thumb_up=False)] * 4
    tracker = GestureTracker(RAW)

    frames = _feed(tracker, cycle + cycle)

    assert [frame.fired_at is not None for frame in frames].count(True) == 2


def test_a_thumb_hovering_between_the_thresholds_never_fires():
    cocked = [make_hand(thumb_gap=0.06)] * 4  # above the 0.055 m "up" threshold
    hovering = [make_hand(thumb_gap=0.045)] * 6  # below "up", above the 0.035 m "down"

    frames = _feed(GestureTracker(RAW), cocked + hovering)

    assert all(frame.fired_at is None for frame in frames)


def test_a_second_shot_inside_the_cooldown_is_ignored():
    config = GestureConfig(min_cutoff=math.inf, beta=0.0, cooldown_ms=1000)
    up, down = make_hand(thumb_up=True), make_hand(thumb_up=False)

    frames = _feed(GestureTracker(config), [up] * 4 + [down, up, down])

    assert [frame.fired_at is not None for frame in frames].count(True) == 1


def test_no_shot_without_the_finger_gun_pose():
    open_up = make_hand(middle=True, ring=True, pinky=True, thumb_up=True)
    open_down = make_hand(middle=True, ring=True, pinky=True, thumb_up=False)

    frames = _feed(GestureTracker(RAW), [open_up] * 6 + [open_down] * 3)

    assert all(frame.fired_at is None for frame in frames)
    assert frames[-1].tracking == "noPose"


def test_a_shot_lands_where_the_aim_was_before_the_thumb_jerked_the_hand():
    steady = [make_hand(tip=(0.5, 0.45), thumb_up=True)] * 6
    jerk = make_hand(tip=(0.5, 0.65), thumb_up=False)  # dropping the thumb pulls the finger down

    frames = _feed(GestureTracker(RAW), [*steady, jerk])

    assert frames[-1].aim == pytest.approx((0.5, 5 / 6))
    assert frames[-1].fired_at == pytest.approx((0.5, 0.5))


def test_a_lost_hand_keeps_the_last_aim_briefly_then_clears_it():
    tracker = GestureTracker(RAW)
    _feed(tracker, [make_hand()] * 4)
    last_ms = 3 * FRAME_MS

    shortly = tracker.update(None, last_ms + 100)
    later = tracker.update(None, last_ms + 400)

    assert shortly.tracking == "lost"
    assert shortly.aim == pytest.approx((0.5, 0.5))
    assert later.tracking == "lost"
    assert later.aim is None


def test_the_filter_calms_jitter_but_follows_a_real_move():
    tracker = GestureTracker(GestureConfig())  # default smoothing
    jitter = [make_hand(tip=(0.5 + (0.01 if i % 2 else -0.01), 0.45)) for i in range(30)]
    jittery = _feed(tracker, jitter)
    xs = [frame.aim[0] for frame in jittery[10:] if frame.aim]
    raw_spread = 2 * 0.01 / 0.6  # ±0.01 in the camera image, through the 0.6-wide box

    assert max(xs) - min(xs) < raw_spread / 2

    moved = _feed(tracker, [make_hand(tip=(0.3, 0.45))] * 30, start_ms=30 * FRAME_MS)
    assert moved[-1].aim[0] == pytest.approx(5 / 6, abs=0.02)
    assert not math.isnan(moved[-1].aim[1])
