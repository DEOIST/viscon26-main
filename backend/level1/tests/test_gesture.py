import json
from pathlib import Path

import numpy as np
import pytest

from level1.gesture import (
    CALIBRATION_FRAMES,
    COCKED_BELOW_DEG,
    DEFAULT_TRIGGER,
    FIRED_ABOVE_DEG,
    PINCH_SETTLING_FRAMES,
    TRACK_TIMEOUT_S,
    TRIGGER_MIN_SAMPLES,
    GunTracker,
    GunTracks,
    PinchTracker,
    PlayerGun,
    drop_duplicate_hands,
    hammer_angle,
    is_gun,
    labels_swapped,
    to_game_area,
    to_points,
)
from level1.tests.hands import make_hand, make_pinch_hand

SIZE = 480  # square frames: the synthetic thumb angles are exact
FRAME_MS = 33
FIXTURES = Path(__file__).parent / "fixtures"


def points(hand):
    return to_points(hand, SIZE, SIZE)


def shifted(hand, dx: float, dy: float = 0.0):
    """The same hand moved by dx, dy (fractions of the frame): a second hand, or a moved one."""
    return tuple((x + dx, y + dy, z) for x, y, z in hand)


def shots(tracker: GunTracker, hands) -> list[bool]:
    return [tracker.update(hand, SIZE, SIZE).shot for hand in hands]


UP, DOWN = make_hand(thumb_up=True), make_hand(thumb_up=False)
FOLDED = make_hand(thumb_folded=True)  # dropped forward: short, but barely tilted
SWAPPED = make_hand(swapped=True)
OPEN, CLOSED = make_pinch_hand(), make_pinch_hand(0.1)


# --- the trigger (GunTracker) ---


def test_the_synthetic_hands_read_as_cocked_and_dropped():
    assert hammer_angle(points(UP)) < COCKED_BELOW_DEG
    assert hammer_angle(points(DOWN)) > FIRED_ABOVE_DEG


@pytest.mark.parametrize(
    ("fingers", "expected"),
    [
        ({}, True),  # ring and pinky curled
        ({"middle": True}, True),  # the middle finger is not checked
        ({"ring": True}, False),
        ({"pinky": True}, False),
        ({"middle": True, "ring": True, "pinky": True}, False),  # open hand
    ],
)
def test_finger_gun_pose(fingers: dict[str, bool], expected: bool):
    assert is_gun(points(make_hand(**fingers))) is expected


def test_a_drop_held_for_two_frames_fires_once_per_cock():
    frames = [UP, DOWN, DOWN, DOWN, UP, DOWN, DOWN, UP]
    assert shots(GunTracker(), frames) == [False, False, True, False, False, False, True, False]


def test_a_thumb_folded_toward_the_camera_fires_though_it_barely_tilts():
    assert COCKED_BELOW_DEG < hammer_angle(points(FOLDED)) < FIRED_ABOVE_DEG
    shot = shots(GunTracker(), [UP, UP, FOLDED, FOLDED, FOLDED, UP])
    assert shot == [False, False, False, True, False, False]


def test_a_folded_thumb_only_counts_once_the_upright_length_is_known():
    assert not any(shots(GunTracker(), [FOLDED] * 4))


def test_the_hand_moving_closer_or_away_never_fires():
    near, far = make_hand(size=0.25), make_hand(size=0.08)
    assert not any(shots(GunTracker(), [UP, far, far, near, near, far, far]))


def test_a_one_frame_flicker_never_fires():
    assert not any(shots(GunTracker(), [UP, DOWN, UP, DOWN, UP, DOWN, UP]))


def test_a_thumb_hovering_between_the_thresholds_never_fires():
    hovering = make_hand(thumb_degrees=(COCKED_BELOW_DEG + FIRED_ABOVE_DEG) / 2)
    assert not any(shots(GunTracker(), [UP] + [hovering] * 6))


def test_swapped_thumb_and_index_labels_read_as_an_upright_thumb():
    # MediaPipe lays the thumb chain sideways: read naively, that is a dropped thumb.
    assert labels_swapped(points(SWAPPED)) and not labels_swapped(points(UP))
    assert hammer_angle(points(SWAPPED)) < COCKED_BELOW_DEG
    assert not any(shots(GunTracker(), [UP, SWAPPED, SWAPPED, SWAPPED, UP]))
    assert not any(shots(GunTracker(), [UP, SWAPPED, SWAPPED, FOLDED, UP]))  # one fold: no shot
    # ...and it re-cocks the gun like any upright thumb.
    assert shots(GunTracker(), [UP, DOWN, DOWN, SWAPPED, DOWN, DOWN]).count(True) == 2


def test_no_shot_without_the_finger_gun_pose():
    open_up = make_hand(middle=True, ring=True, pinky=True)
    open_down = make_hand(middle=True, ring=True, pinky=True, thumb_up=False)
    assert not any(shots(GunTracker(), [open_up, open_down, open_down, open_down]))


# --- telling hands apart (GunTracks, drop_duplicate_hands) ---


def test_each_hand_keeps_its_id_and_its_own_shots():
    right_up, right_down = shifted(UP, 0.3), shifted(DOWN, 0.3)
    left = shifted(UP, -0.2)
    tracks = GunTracks()

    tracks.update([left, right_up], SIZE, SIZE, t=0.0)
    left_id, right_id = tracks.ids
    assert left_id != right_id
    # MediaPipe may list the hands in any order; ids follow the hands, not the list position.
    tracks.update([right_up, left], SIZE, SIZE, t=0.033)
    assert tracks.ids == [right_id, left_id]
    # Only the right hand drops its thumb, so only its track fires.
    tracks.update([right_down, left], SIZE, SIZE, t=0.066)
    readings = tracks.update([right_down, left], SIZE, SIZE, t=0.1)
    assert [r.shot for r in readings] == [True, False]


def test_a_hand_missing_briefly_keeps_its_track_and_cocked_thumb():
    tracks = GunTracks()
    tracks.update([UP], SIZE, SIZE, t=0.0)
    hand_id = tracks.ids[0]
    assert tracks.update([], SIZE, SIZE, t=TRACK_TIMEOUT_S / 2) == []
    tracks.update([DOWN], SIZE, SIZE, t=TRACK_TIMEOUT_S * 0.9)
    (after,) = tracks.update([DOWN], SIZE, SIZE, t=TRACK_TIMEOUT_S)
    assert tracks.ids == [hand_id] and after.shot


def test_a_hand_gone_too_long_comes_back_as_a_new_uncocked_track():
    tracks = GunTracks()
    tracks.update([UP], SIZE, SIZE, t=0.0)
    hand_id = tracks.ids[0]
    tracks.update([DOWN], SIZE, SIZE, t=TRACK_TIMEOUT_S * 1.5)
    (after,) = tracks.update([DOWN], SIZE, SIZE, t=TRACK_TIMEOUT_S * 1.6)
    assert tracks.ids != [hand_id] and not after.shot


def test_a_second_detection_of_the_same_hand_is_dropped():
    copy = shifted(UP, 0.02)  # the same hand reported twice, slightly offset
    center_x, center_y = np.mean([p[0] for p in UP]), np.mean([p[1] for p in UP])
    partial = tuple(  # a detection covering only the middle of the hand
        (center_x + 0.6 * (x - center_x), center_y + 0.6 * (y - center_y), z) for x, y, z in UP
    )
    kept, duplicates = drop_duplicate_hands([partial, copy, UP])
    assert len(kept) == 1 and partial not in kept
    assert len(duplicates) == 2


@pytest.mark.parametrize("gap", ["side by side, slightly overlapping", "far apart"])
def test_separate_hands_are_kept(gap: str):
    width = max(p[0] for p in UP) - min(p[0] for p in UP)
    other = shifted(UP, 0.6 * width if gap.startswith("side") else 0.45)
    kept, duplicates = drop_duplicate_hands([UP, other])
    assert len(kept) == 2 and duplicates == []


def test_the_calibration_box_maps_the_skeleton_onto_the_game_area_mirrored():
    box = (0.2, 0.15, 0.8, 0.75)
    assert to_game_area((0.8, 0.15), box) == pytest.approx((0.0, 0.0))  # camera right = screen left
    assert to_game_area((0.5, 0.45), box) == pytest.approx((0.5, 0.5))
    assert to_game_area((0.05, 0.95), box)[0] > 1  # not clamped: a hand may reach past the edge


# --- PlayerGun: the game's one crosshair ---


def play(gun: PlayerGun, frames, start_ms: float = 0):
    return [
        gun.update(hands, SIZE, SIZE, start_ms + i * FRAME_MS) for i, hands in enumerate(frames)
    ]


def calibrated(hand=OPEN) -> tuple[PlayerGun, float]:
    """A PlayerGun whose neutral position is `hand`, and the time after calibrating."""
    gun = PlayerGun()
    frames = play(gun, [[hand]] * CALIBRATION_FRAMES)
    assert frames[-1].tracking == "ok"
    return gun, CALIBRATION_FRAMES * FRAME_MS


def expected_aim(hand, box=(0.2, 0.15, 0.8, 0.75)):
    midpoint = tuple((hand[4][i] + hand[8][i]) / 2 for i in range(2))
    return tuple(min(max(v, 0), 1) for v in to_game_area(midpoint, box))


def test_aim_is_available_immediately_without_neutral_calibration():
    (frame,) = play(PlayerGun(), [[OPEN]])
    assert frame.tracking == "ok"
    assert frame.aim == pytest.approx(expected_aim(OPEN), abs=0.0001)
    assert frame.fired_at is None


def test_a_pinch_requires_opening_then_two_confirming_frames():
    frames = play(PlayerGun(), [[CLOSED], [OPEN], [CLOSED], [CLOSED], [CLOSED]])
    assert [f.fired_at is not None for f in frames] == [False, False, False, True, False]
    assert [f.pinching for f in frames] == [False, False, False, True, True]


def test_the_aim_follows_the_hand_mirrored_and_scaled():
    gun, start = calibrated()
    moved_hand = shifted(OPEN, 0.05, 0.03)
    moved = play(gun, [[moved_hand]] * 60, start_ms=start)[-1]
    assert moved.aim == pytest.approx(expected_aim(moved_hand), abs=0.001)
    assert moved.aim[0] < expected_aim(OPEN)[0]
    assert moved.aim[1] > expected_aim(OPEN)[1]


def test_the_aim_uses_both_fingertips():
    gun, start = calibrated()
    wider = make_pinch_hand(1.2)
    frame = play(gun, [[wider]] * 60, start_ms=start)[-1]
    assert frame.aim == pytest.approx(expected_aim(wider), abs=0.001)
    assert frame.aim != pytest.approx(expected_aim(OPEN), abs=0.01)


def test_recenter_resets_smoothing_without_a_calibration_pause():
    gun, start = calibrated()
    elsewhere = shifted(OPEN, 0.1, 0.05)
    gun.recenter()
    (frame,) = play(gun, [[elsewhere]], start_ms=start)
    assert frame.tracking == "ok"
    assert frame.aim == pytest.approx(expected_aim(elsewhere), abs=0.0001)


def test_a_grab_lands_at_the_current_fingertip_midpoint():
    gun, start = calibrated()
    moved = shifted(CLOSED, -0.04)
    frames = play(gun, [[moved], [moved]], start_ms=start)
    assert frames[-1].fired_at == pytest.approx(expected_aim(moved))
    assert frames[-1].fired_at != frames[-1].aim  # grab bypasses display smoothing


def test_the_player_reports_tracking_for_open_hand_and_absence():
    gun, start = calibrated()
    frames = play(gun, [[OPEN], [CLOSED], []], start_ms=start)
    assert [f.tracking for f in frames] == ["ok", "ok", "lost"]
    assert frames[0].hand == OPEN and frames[2].hand is None
    assert frames[0].thumb_angle is not None


def test_the_largest_hand_is_the_player():
    near = make_hand(tip=(0.3, 0.45), size=0.2)
    far = make_hand(tip=(0.7, 0.45), size=0.1, thumb_up=False)
    (frame,) = play(PlayerGun(), [[far, near]])
    assert frame.hand == near


def test_a_bigger_hand_appearing_later_does_not_steal_the_crosshair():
    player = make_hand(tip=(0.3, 0.45), size=0.1)
    newcomer = make_hand(tip=(0.7, 0.45), size=0.2)
    frames = play(PlayerGun(), [[player], [newcomer, player], [newcomer, player]])
    assert all(f.hand == player for f in frames)
    assert len({f.player_id for f in frames}) == 1


def test_a_brief_dropout_of_the_player_does_not_hand_the_crosshair_over():
    player = make_hand(tip=(0.3, 0.45), size=0.2)
    other = make_hand(tip=(0.75, 0.45), size=0.1)
    frames = play(PlayerGun(), [[player, other], [other], [player, other]])
    assert frames[1].tracking == "lost" and frames[1].aim == frames[0].aim
    assert frames[2].hand == player


def test_the_crosshair_moves_to_another_hand_once_the_player_is_gone():
    player = make_hand(tip=(0.3, 0.45), size=0.2)
    other = make_hand(tip=(0.75, 0.45), size=0.1)
    gun = PlayerGun()
    play(gun, [[player, other]])
    (later,) = play(gun, [[other]], start_ms=TRACK_TIMEOUT_S * 1000 * 2)
    assert later.hand == other


def test_someone_else_dropping_a_thumb_does_not_shoot():
    player = make_hand(tip=(0.3, 0.45), size=0.2)
    bystander_up = make_hand(tip=(0.75, 0.45), size=0.1)
    bystander_down = make_hand(tip=(0.75, 0.45), size=0.1, thumb_up=False)
    gun = PlayerGun()
    play(gun, [[player, bystander_up]] * CALIBRATION_FRAMES)
    frames = play(
        gun,
        [[player, bystander_up]] + [[player, bystander_down]] * 3,
        start_ms=CALIBRATION_FRAMES * FRAME_MS,
    )
    assert frames[0].tracking == "ok"
    assert not any(f.fired_at for f in frames)


def test_a_lost_hand_keeps_the_last_aim_briefly_then_clears_it():
    gun, start = calibrated()
    (seen,) = play(gun, [[UP]], start_ms=start)
    (brief,) = play(gun, [[]], start_ms=start + TRACK_TIMEOUT_S * 1000 / 2)
    (long,) = play(gun, [[]], start_ms=start + TRACK_TIMEOUT_S * 1000 * 2)
    assert brief.tracking == "lost" and brief.aim == seen.aim
    assert long.aim is None


@pytest.mark.parametrize(("cooldown_ms", "expected"), [(250, 1), (50, 2)])
def test_the_cooldown_blocks_an_instant_second_shot_and_can_be_shortened(
    cooldown_ms: float, expected: int
):
    gun, start = calibrated()
    gun.cooldown_ms = cooldown_ms
    frames = play(
        gun, [[CLOSED], [CLOSED], [OPEN], [CLOSED], [CLOSED]], start_ms=start
    )  # 2 shots, 100 ms
    assert sum(f.fired_at is not None for f in frames) == expected


# Webcam recordings from the game (landmarks of every detected hand, tests/fixtures/README.md)
# with the frames where the thumb was visibly down, labeled by eye by comparing each frame with
# the ones before it. Unclear moments are neither required nor counted as false shots. 1 and 2
# mix sideways and forward drops, 3 is mostly forward drops at a steady rhythm, 4 is forward
# drops that barely tilt the thumb (30–39 deg).
RECORDINGS = {
    "play_1.jsonl": (
        [44, 116, 132, 231, 257, 278, 292, 344, 368, 412, 438, 472, 488, 572, 620],
        [range(20, 30), range(180, 192), range(500, 512), range(552, 560)],
    ),
    "play_2.jsonl": (
        [49, 107, 172, 192, 208, 256, 281, 317, 333, 350, 378, 442, 537, 549, 582],
        [range(60, 70), range(390, 400), range(484, 494)],
    ),
    "play_3.jsonl": (
        [
            24,
            118,
            198,
            214,
            233,
            244,
            258,
            293,
            306,
            333,
            359,
            382,
            405,
            444,
            461,
            494,
            522,
            558,
            588,
            606,
            621,
            646,
            682,
            700,
            723,
        ],
        [range(0, 23), range(140, 181), range(650, 663), range(736, 752)],
    ),
    "play_4.jsonl": ([28, 62, 84, 102, 116, 132, 148, 165], []),
}


def replay(name: str):
    """The game's frames for a recording, cooldown included."""
    gun = PlayerGun()
    with open(FIXTURES / "captures" / name) as rows:
        return [
            gun.update(
                [[tuple(p) for p in hand] for hand in row["hands"]], *row["size"], row["t_ms"]
            )
            for row in map(json.loads, rows)
        ]


@pytest.mark.parametrize("name", RECORDINGS)
def test_recorded_play_fires_every_drop_and_nothing_else(name: str):
    shot_frames, unclear = RECORDINGS[name]
    tracks = GunTracks()
    fired = []
    last_shot = -float("inf")
    with open(FIXTURES / "captures" / name) as rows:
        for k, row in enumerate(map(json.loads, rows)):
            hands, _ = drop_duplicate_hands(row["hands"])
            readings = tracks.update(hands, *row["size"], row["t_ms"] / 1000)
            if readings and readings[0].shot and row["t_ms"] - last_shot >= 250:
                fired.append(k)
                last_shot = row["t_ms"]

    def near(frame: int, shot: int) -> bool:  # the shot registers while the thumb still drops
        return frame - 12 <= shot <= frame + 4

    assert all(any(near(f, s) for s in fired) for f in shot_frames), fired
    false_shots = [
        s
        for s in fired
        if not any(near(f, s) for f in shot_frames) and not any(s in r for r in unclear)
    ]
    assert false_shots == []


@pytest.mark.parametrize("name", RECORDINGS)
def test_recorded_aim_is_smooth_and_never_jumps(name: str):
    aims = np.array([f.aim for f in replay(name) if f.tracking in ("ok", "noPose")])
    wobble = np.median(np.abs(np.diff(aims, 2, axis=0)))  # frame-to-frame change of velocity
    assert wobble < 0.003
    # The old aim used the index tip, which label swaps threw across the screen.
    assert (np.abs(np.diff(aims, axis=0)) > 0.1).sum() <= 2


# --- trigger calibration (PlayerGun.calibrate_trigger) ---


def calibrate_trigger(gun: PlayerGun, up, down, start_ms: float = 0.0):
    """Runs the game's calibration: thumb up, down, up, down, each held for a moment."""
    held = TRIGGER_MIN_SAMPLES + PINCH_SETTLING_FRAMES
    t = start_ms
    for step, hand in (("up", up), ("down", down), ("up", up), ("down", down)):
        gun.calibrate_trigger(step)
        play(gun, [[hand]] * held, start_ms=t)
        t += held * FRAME_MS
    return gun.calibrate_trigger("done"), t


def fires(gun: PlayerGun, up, down, start_ms: float) -> bool:
    frames = play(gun, [[up]] * 3 + [[down]] * 3, start_ms=start_ms)
    return any(f.fired_at for f in frames)


def test_a_small_pinch_gap_fires_only_after_calibrating():
    up, down = make_pinch_hand(0.6), make_pinch_hand(0.35)
    gun, t = calibrated(up)
    assert not fires(gun, up, down, t)
    (trigger, problem), t = calibrate_trigger(gun, up, down, t + 6 * FRAME_MS)
    assert problem is None
    assert 0.35 < trigger.pinch_closed_below < trigger.pinch_open_above < 0.6
    assert fires(gun, up, down, t)


def test_a_narrow_open_gap_arms_after_calibrating():
    up, down = make_pinch_hand(0.5), make_pinch_hand(0.1)
    gun, t = calibrated(up)
    assert not fires(gun, up, down, t)
    (trigger, problem), t = calibrate_trigger(gun, up, down, t + 6 * FRAME_MS)
    assert problem is None and trigger.pinch_open_above < 0.5
    assert fires(gun, up, down, t)


def test_pinch_thresholds_are_independent_of_camera_distance():
    for size in (0.08, 0.25):
        tracker = PinchTracker()
        frames = [make_pinch_hand(1, size=size), make_pinch_hand(0.1, size=size)]
        readings = [tracker.update(hand, SIZE, SIZE) for hand in frames + frames[1:]]
        assert [r.shot for r in readings] == [False, False, True]
        assert readings[-1].pinch_distance == pytest.approx(0.1)


def test_calibration_keeps_the_trigger_when_open_and_closed_look_the_same():
    gun, t = calibrated()
    (trigger, problem), _ = calibrate_trigger(gun, OPEN, OPEN, t)
    assert trigger == DEFAULT_TRIGGER
    assert problem is not None and "Separate" in problem


def test_calibration_needs_both_fingertips_in_view():
    gun, t = calibrated()
    gun.calibrate_trigger("up")
    play(gun, [[OPEN]] * (TRIGGER_MIN_SAMPLES + PINCH_SETTLING_FRAMES), start_ms=t)
    gun.calibrate_trigger("down")
    play(gun, [[]] * TRIGGER_MIN_SAMPLES, start_ms=t + 1000)
    trigger, problem = gun.calibrate_trigger("done")
    assert trigger == DEFAULT_TRIGGER
    assert problem is not None and "visible" in problem


def test_reset_restores_the_default_trigger():
    gun, t = calibrated()
    (trigger, problem), _ = calibrate_trigger(gun, OPEN, CLOSED, t)
    assert problem is None and trigger != DEFAULT_TRIGGER
    assert gun.calibrate_trigger("reset") == (DEFAULT_TRIGGER, None)


def test_stationary_and_very_slow_hands_do_not_slap_or_slide():
    for step in (0.0, 0.005):
        frames = play(PlayerGun(), [[shifted(OPEN, step * i)] for i in range(30)])
        assert not any(f.slap or f.slide for f in frames)


def test_open_hand_slide_carries_the_whole_hand_sweep():
    frames = play(PlayerGun(), [[shifted(OPEN, 0.02 * i)] for i in range(16)])
    slides = [f.slide for f in frames if f.slide]
    assert len(slides) == 1
    assert slides[0].direction == "left"
    assert len(slides[0].outlines) == len(slides[0].path)
    assert all(len(outline) == 21 for outline in slides[0].outlines)
    assert not any(f.slap for f in frames)


def test_pinching_does_not_generate_a_slow_slide():
    frames = play(PlayerGun(), [[OPEN], [CLOSED], [CLOSED]])
    frames += play(PlayerGun(), [[shifted(CLOSED, 0.02 * i)] for i in range(16)])
    assert not any(f.slide for f in frames)


def test_a_fast_swing_slaps_once():
    frames = play(PlayerGun(), [[shifted(OPEN, 0.1 * i)] for i in range(6)])
    assert [f.slap for f in frames if f.slap] == ["left"]


def test_a_hand_that_blurs_away_mid_swing_slaps():
    frames = play(PlayerGun(), [[OPEN], [shifted(OPEN, -0.06)], []])
    assert frames[-1].slap == "right"


def test_a_slide_does_not_swallow_the_slap_right_after_it():
    sweep = [[shifted(OPEN, 0.02 * i)] for i in range(16)]
    swing = [[shifted(OPEN, 0.3 - 0.1 * i)] for i in range(1, 6)]
    frames = play(PlayerGun(), sweep + swing)
    assert any(f.slide for f in frames[:16])
    assert [f.slap for f in frames[16:] if f.slap] == ["right"]


def test_a_short_gentle_swipe_counts():
    # 0.36 camera widths/s over 0.17 widths: too short and slow before the sensitivity tuning
    frames = play(PlayerGun(), [[shifted(OPEN, 0.012 * i)] for i in range(15)])
    assert [f.slide.direction for f in frames if f.slide] == ["left"]
    assert not any(f.slap for f in frames)


# A remote server answers ~10 times a second instead of ~30: frames are 100 ms apart, so a fast
# hand moves 3x further between frames and must still count as the same hand.
REMOTE_FRAME_MS = 100


def test_a_slap_counts_at_a_remote_servers_frame_rate():
    still = [[OPEN]] * 10
    sweep = [[shifted(OPEN, 0.3)], [shifted(OPEN, 0.6)], []]
    gun = PlayerGun()
    frames = [gun.update(h, SIZE, SIZE, i * REMOTE_FRAME_MS) for i, h in enumerate(still + sweep)]
    assert [f.slap for f in frames if f.slap] == ["left"]
    assert frames[-3].tracking != "lost"


def test_a_fast_drag_keeps_the_pinch_at_a_remote_servers_frame_rate():
    pinch = [[OPEN]] * 5 + [[CLOSED]] * 5
    drag = [[shifted(CLOSED, 0.3 * i)] for i in range(1, 4)]  # 3 frame widths a second
    gun = PlayerGun()
    frames = [gun.update(h, SIZE, SIZE, i * REMOTE_FRAME_MS) for i, h in enumerate(pinch + drag)]
    assert all(f.tracking != "lost" and f.pinching for f in frames[-3:])


def test_a_far_away_hand_never_takes_over_the_players_track():
    gun = PlayerGun()
    gun.update([OPEN], SIZE, SIZE, 0)
    frame = gun.update([shifted(OPEN, 0.9)], SIZE, SIZE, 250)  # gone, then a hand far away
    assert frame.tracking == "lost"
