"""Recoil intent versus aiming, independent of a camera, hand size, and camera frame rate."""

import json
import math

import pytest

from level1.gesture import CALIBRATION_FRAMES, GunTracker, GunTracks, PlayerGun, labels_swapped
from level1.recoil import RECOIL_AIM_HOLD_S, RECOIL_MAX_DURATION_S, RECOIL_MAX_FRAME_GAP_S
from level1.tests.hands import make_hand, recoil_hand
from level1.tests.test_gesture import FIXTURES, RECORDINGS, points, replay, shifted

SIZE = 480
FRAME_S = 1 / 30
BASE = make_hand()
PULSE = [0.15, 0.36, 0.55, 0.32, 0.10, 0.0]

# Labeled from the JPEGs of 20261010-142709-729104, not from detector output. Includes a
# sideways/upward wrist pitch, an edge-on fist, and an index misread followed by tracking loss.
# The second recording adds brief curled-finger misreads and a barrel turning from right to up.
RECORDED_RECOILS = {
    "recoil_1.jsonl": [(20, 26), (57, 61), (175, 181), (221, 226), (268, 273), (319, 324)],
    "recoil_2.jsonl": [(41, 44), (81, 84), (132, 139), (152, 155), (222, 225), (287, 290)],
}


@pytest.fixture(scope="module", params=RECORDED_RECOILS)
def recoil_capture(request):
    rows = [
        json.loads(line)
        for line in (FIXTURES / "captures" / request.param).read_text().splitlines()
    ]
    return rows, replay(request.param, trigger="recoil"), RECORDED_RECOILS[request.param]


def test_recorded_recoils_all_fire_once_with_no_shots_during_ordinary_aiming(recoil_capture):
    _, frames, intervals = recoil_capture
    fired = [i for i, frame in enumerate(frames) if frame.fired_at is not None]
    assert len(fired) == len(intervals), fired
    for first, last in intervals:
        assert sum(first <= i <= last for i in fired) == 1, fired


@pytest.mark.parametrize("recoil", range(6))
def test_recorded_recoil_keeps_the_cursor_and_shot_at_the_same_aim(recoil_capture, recoil):
    rows, frames, intervals = recoil_capture
    first, last = intervals[recoil]
    shot = next(i for i in range(first, last + 1) if frames[i].fired_at is not None)
    pending = next(
        i
        for i in range(first, shot + 1)
        if any(h.id == frames[i].player_id and h.reading.recoil_aim_time for h in frames[i].hands)
    )
    target = frames[pending].aim
    assert frames[shot].fired_at == target
    held_until = rows[shot]["t_ms"] + RECOIL_AIM_HOLD_S * 1000
    for i in range(pending, len(frames)):
        if rows[i]["t_ms"] > held_until:
            break
        assert frames[i].aim == target, i


def test_recorded_normal_aiming_still_moves_the_cursor(recoil_capture):
    _, frames, intervals = recoil_capture
    # These image-labeled aiming intervals must move the crosshair without shooting or
    # keeping it frozen (between recoils 2/3 in capture 1 and 4/5 in capture 2).
    first, last = (128, 172) if intervals[0][0] == 20 else (165, 195)
    aims = [frame.aim for frame in frames[first:last] if frame.aim is not None]
    assert max(aim[1] for aim in aims) - min(aim[1] for aim in aims) > 0.2
    assert not any(frame.fired_at for frame in frames[first:last])


def feed(tracker: GunTracker, hands, *, start: float = 0, dt: float = FRAME_S):
    return [tracker.update(hand, SIZE, SIZE, start + i * dt) for i, hand in enumerate(hands)]


def ready(hand=BASE):
    tracker = GunTracker()
    readings = feed(tracker, [hand] * 8)
    assert readings[-1].cocked
    return tracker, 8 * FRAME_S


@pytest.mark.parametrize("size", [0.08, 0.15, 0.25])
@pytest.mark.parametrize("thumb", [{}, {"thumb_up": False}, {"thumb_folded": True}])
def test_a_quick_index_recoil_fires_once_regardless_of_hand_size_or_thumb(size, thumb):
    hand = make_hand(size=size, **thumb)
    tracker, start = ready(hand)
    readings = feed(tracker, [recoil_hand(hand, lift) for lift in PULSE], start=start)
    assert [r.shot for r in readings] == [False, False, False, True, False, False]
    assert readings[3].shot_time == pytest.approx(start - FRAME_S)


@pytest.mark.parametrize("fps", [15, 24, 30, 60])
def test_recoil_timings_use_seconds_at_different_camera_rates(fps):
    dt = 1 / fps
    tracker = GunTracker()
    count = math.ceil(0.25 / dt)
    feed(tracker, [BASE] * count, dt=dt)
    # A 140 ms rise to 0.65 palm widths, then a 140 ms return.
    duration = 0.28
    lifts = [
        0.65 * max(0, 1 - abs(i * dt - 0.14) / 0.14) for i in range(1, math.ceil(duration / dt) + 1)
    ]
    readings = feed(tracker, [recoil_hand(BASE, lift) for lift in lifts], start=count * dt, dt=dt)
    assert sum(r.shot for r in readings) == 1


@pytest.mark.parametrize("direction", [(0, -0.02), (0.02, 0), (0.02, -0.02)])
def test_whole_hand_upward_sideways_and_diagonal_aiming_never_fires(direction):
    tracker, start = ready()
    dx, dy = direction
    moved = [shifted(BASE, dx * i, dy * i) for i in range(20)]
    assert not any(r.shot for r in feed(tracker, moved, start=start))


def test_a_slow_index_lift_and_return_never_fires():
    tracker, start = ready()
    lifts = [i * 0.03 for i in range(20)] + [i * 0.03 for i in reversed(range(20))]
    assert not any(
        r.shot for r in feed(tracker, [recoil_hand(BASE, x) for x in lifts], start=start)
    )


def test_a_quick_upward_aim_change_held_at_its_new_position_never_fires():
    tracker, start = ready()
    lifts = PULSE[:3] + [PULSE[2]] * 20
    assert not any(
        r.shot for r in feed(tracker, [recoil_hand(BASE, x) for x in lifts], start=start)
    )
    # A much later return is still aiming, not a delayed shot.
    readings = feed(tracker, [BASE] * 8, start=start + len(lifts) * FRAME_S)
    assert not any(r.shot for r in readings)


@pytest.mark.parametrize("sign", [-1, 1])
def test_a_sideways_or_downward_flick_never_fires(sign):
    tracker, start = ready()
    hands = [recoil_hand(BASE, sign * x, sideways=x) for x in PULSE]
    assert not any(r.shot for r in feed(tracker, hands, start=start))


def test_jitter_and_one_frame_index_spikes_never_fire():
    tracker, start = ready()
    lifts = [0.04, -0.04, 0.03, 0, 0.55, 0, 0, 0, 0.05, -0.03] * 3
    assert not any(
        r.shot for r in feed(tracker, [recoil_hand(BASE, x) for x in lifts], start=start)
    )


def test_thumb_drops_and_thumb_index_label_swaps_never_fire_the_live_trigger():
    tracker, start = ready()
    hands = [make_hand(thumb_up=False)] * 3 + [BASE] * 6
    hands += [make_hand(swapped=True)] * 3 + [BASE] * 6
    hands += [make_hand(thumb_folded=True)] * 3 + [BASE] * 6
    assert not any(r.shot for r in feed(tracker, hands, start=start))


def test_a_real_index_can_recoil_upright_without_being_rejected_as_a_swapped_thumb():
    tracker, start = ready()
    lifts = [0.2, 0.6, 1.1, 0.6, 0.1, 0]
    hands = [recoil_hand(BASE, x) for x in lifts]
    assert labels_swapped(points(hands[2]))
    assert sum(r.shot for r in feed(tracker, hands, start=start)) == 1


def test_staying_raised_after_confirmation_cannot_fire_again():
    tracker, start = ready()
    lifts = PULSE[:4] + [0.45, 0.65, 0.35] * 5
    assert (
        sum(r.shot for r in feed(tracker, [recoil_hand(BASE, x) for x in lifts], start=start)) == 1
    )


def test_returning_and_settling_rearms_for_another_deliberate_recoil():
    tracker, start = ready()
    lifts = PULSE + [0] * 6 + PULSE
    assert (
        sum(r.shot for r in feed(tracker, [recoil_hand(BASE, x) for x in lifts], start=start)) == 2
    )


def test_returning_with_sideways_index_noise_rearms_without_waiting_for_timeout():
    tracker, start = ready()
    hands = [recoil_hand(BASE, lift) for lift in PULSE]
    hands += [recoil_hand(BASE, 0, sideways=0.2)] * 6
    hands += [recoil_hand(BASE, lift, sideways=0.2) for lift in PULSE]
    assert sum(r.shot for r in feed(tracker, hands, start=start)) == 2


def test_reaiming_after_a_shot_cannot_leave_the_trigger_permanently_disarmed():
    tracker, start = ready()
    lifts = PULSE[:4] + [0.32] * 20 + [0.32 + x for x in PULSE]
    readings = feed(tracker, [recoil_hand(BASE, x) for x in lifts], start=start)
    assert sum(r.shot for r in readings[:4]) == 1
    assert not any(r.shot for r in readings[4:24])
    assert sum(r.shot for r in readings[24:]) == 1


def test_no_recoil_shot_without_gun_pose():
    opened = make_hand(ring=True, pinky=True)
    tracker = GunTracker()
    hands = [opened] * 8 + [recoil_hand(opened, x) for x in PULSE]
    assert not any(r.shot for r in feed(tracker, hands))


def test_pose_loss_during_recoil_discards_the_pulse():
    tracker, start = ready()
    hands = [recoil_hand(BASE, x) for x in PULSE[:3]]
    hands += [recoil_hand(make_hand(ring=True), PULSE[3]), BASE, BASE]
    assert not any(r.shot for r in feed(tracker, hands, start=start))


def test_a_missing_frame_keeps_the_hand_id_but_discards_pending_recoil():
    tracks = GunTracks()
    for i in range(8):
        tracks.update([BASE], SIZE, SIZE, i * FRAME_S)
    hand_id = tracks.ids[0]
    for i, lift in enumerate(PULSE[:3], start=8):
        tracks.update([recoil_hand(BASE, lift)], SIZE, SIZE, i * FRAME_S)
    tracks.update([], SIZE, SIZE, 11 * FRAME_S)
    readings = tracks.update([recoil_hand(BASE, PULSE[3])], SIZE, SIZE, 12 * FRAME_S)
    assert tracks.ids == [hand_id]
    assert not readings[0].shot


def test_long_gaps_and_repeated_timestamps_do_not_complete_a_pending_shot():
    for gap in (0, RECOIL_MAX_FRAME_GAP_S * 1.5, RECOIL_MAX_DURATION_S * 2):
        tracker, start = ready()
        feed(tracker, [recoil_hand(BASE, x) for x in PULSE[:3]], start=start)
        last_t = start + 2 * FRAME_S
        assert not tracker.update(recoil_hand(BASE, PULSE[3]), SIZE, SIZE, last_t + gap).shot


def test_moving_closer_and_away_never_fires():
    tracker, start = ready()
    hands = [make_hand(size=size) for size in (0.08, 0.15, 0.25, 0.15)] * 4
    assert not any(r.shot for r in feed(tracker, hands, start=start))


@pytest.mark.parametrize(("width", "height"), [(640, 480), (1280, 720), (480, 640)])
@pytest.mark.parametrize("mirrored", [False, True])
def test_recoil_uses_pixel_geometry_for_either_hand_and_camera_aspect(width, height, mirrored):
    def camera_hand(hand):
        return tuple(
            (1 - x if mirrored else x, 0.5 + (y - 0.5) * width / height, z) for x, y, z in hand
        )

    tracker = GunTracker()
    hands = [BASE] * 8 + [recoil_hand(BASE, lift) for lift in PULSE]
    readings = [
        tracker.update(camera_hand(hand), width, height, i * FRAME_S)
        for i, hand in enumerate(hands)
    ]
    assert sum(r.shot for r in readings) == 1


def test_pitching_the_finger_gun_up_and_back_at_the_wrist_fires():
    def pitched(degrees):
        angle = math.radians(degrees)
        wrist_y, wrist_z = BASE[0][1:]
        return tuple(
            (
                x,
                wrist_y + (y - wrist_y) * math.cos(angle) + (z - wrist_z) * math.sin(angle),
                wrist_z - (y - wrist_y) * math.sin(angle) + (z - wrist_z) * math.cos(angle),
            )
            for x, y, z in BASE
        )

    tracker, start = ready()
    hands = [pitched(degrees) for degrees in (6, 14, 23, 12, 3, 0)]
    assert sum(r.shot for r in feed(tracker, hands, start=start)) == 1


@pytest.mark.parametrize(("cooldown_ms", "expected"), [(250, 1), (175, 2)])
def test_the_athlete_perk_allows_a_second_recoil_during_default_cooldown(cooldown_ms, expected):
    dt = 1 / 60
    gun = PlayerGun(cooldown_ms)
    lifts = [0] * (CALIBRATION_FRAMES + 12)
    pulse = [0.15, 0.40, 0.23, 0]
    lifts += pulse + [0] * 8 + pulse
    frames = [
        gun.update([recoil_hand(BASE, lift)], SIZE, SIZE, i * dt * 1000)
        for i, lift in enumerate(lifts)
    ]
    assert sum(frame.fired_at is not None for frame in frames) == expected


def test_a_bystander_recoiling_does_not_shoot_for_the_player():
    gun = PlayerGun()
    bystander = make_hand(tip=(0.9, 0.45), size=0.08)
    for i in range(CALIBRATION_FRAMES + 8):
        gun.update([BASE, bystander], SIZE, SIZE, i * FRAME_S * 1000)
    start = (CALIBRATION_FRAMES + 8) * FRAME_S * 1000
    frames = [
        gun.update([BASE, recoil_hand(bystander, lift)], SIZE, SIZE, start + i * FRAME_S * 1000)
        for i, lift in enumerate(PULSE)
    ]
    assert any(hand.reading.shot for frame in frames for hand in frame.hands)
    assert not any(frame.fired_at for frame in frames)


def test_calibration_and_recenter_cannot_leak_a_pending_recoil():
    gun = PlayerGun()
    hands = [BASE] * 5 + [recoil_hand(BASE, x) for x in PULSE]
    frames = [gun.update([hand], SIZE, SIZE, i * FRAME_S * 1000) for i, hand in enumerate(hands)]
    assert not any(f.fired_at for f in frames)
    for i in range(30):
        gun.update([BASE], SIZE, SIZE, (len(hands) + i) * FRAME_S * 1000)
    start = (len(hands) + 30) * FRAME_S * 1000
    for i, lift in enumerate(PULSE[:3]):
        gun.update([recoil_hand(BASE, lift)], SIZE, SIZE, start + i * FRAME_S * 1000)
    gun.recenter()
    assert gun.update([BASE], SIZE, SIZE, start + 3 * FRAME_S * 1000).fired_at is None


def test_the_shot_uses_aim_at_flick_start_even_when_the_palm_recoils_a_little():
    gun = PlayerGun()
    for i in range(CALIBRATION_FRAMES + 8):
        before = gun.update([BASE], SIZE, SIZE, i * FRAME_S * 1000)
    start = (CALIBRATION_FRAMES + 8) * FRAME_S * 1000
    frames = [
        gun.update(
            [shifted(recoil_hand(BASE, lift), 0, -0.01)], SIZE, SIZE, start + i * FRAME_S * 1000
        )
        for i, lift in enumerate(PULSE)
    ]
    shots = [f for f in frames if f.fired_at is not None]
    assert len(shots) == 1
    assert shots[0].fired_at == before.aim
    assert all(frame.aim == before.aim for frame in frames)
    assert shots[0].aim == shots[0].fired_at


@pytest.mark.parametrize("name", RECORDINGS)
def test_old_thumb_recordings_do_not_fire_unintended_recoil_shots(name):
    assert not any(frame.fired_at for frame in replay(name, trigger="recoil"))


def test_recorded_blurred_pose_holds_aim_and_waits_for_certain_recoil_observations():
    frames = replay("recoil_2.jsonl", trigger="recoil")
    for first, last, shot in ((81, 81, 83), (219, 222, 224)):
        before = frames[first - 1].aim
        for frame in frames[first : last + 1]:
            reading = next(h.reading for h in frame.hands if h.id == frame.player_id)
            assert reading.gun
            assert not reading.pose_certain
            assert not reading.shot
            assert frame.aim == before
        assert frames[shot].fired_at == before


def test_small_independent_twitches_cannot_accumulate_into_one_recoil():
    tracker, start = ready()
    # An incomplete rise, fall and second higher twitch must not borrow the first twitch's
    # upward observations to qualify as one continuous rise.
    lifts = [0.15, 0.25, 0.15, 0.36, 0]
    assert not any(
        r.shot for r in feed(tracker, [recoil_hand(BASE, x) for x in lifts], start=start)
    )


def test_uncertain_pose_cannot_confirm_a_shot_or_remain_valid_indefinitely():
    tracker, start = ready()
    blurred = list(BASE)
    # A ring tip just beyond its PIP is a marginal pose misread, unlike a clearly open hand.
    blurred[16] = tuple(w + 1.1 * (p - w) for w, p in zip(BASE[0], BASE[14], strict=True))
    readings = feed(tracker, [recoil_hand(tuple(blurred), x) for x in PULSE], start=start)
    assert readings[0].gun
    assert not any(r.pose_certain or r.shot for r in readings)
    assert not readings[-1].gun
    assert readings[-1].recoil_phase == "settling"
