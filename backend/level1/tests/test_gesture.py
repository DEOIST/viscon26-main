import json
from pathlib import Path

import numpy as np
import pytest

from level1.gesture import (
    AIM_GAIN,
    CALIBRATION_FRAMES,
    COCKED_BELOW_DEG,
    DEFAULT_TRIGGER,
    FIRED_ABOVE_DEG,
    GAME_ASPECT,
    SHOT_AIM_LOOKBACK_S,
    TRACK_TIMEOUT_S,
    TRIGGER_MIN_SAMPLES,
    GunTracker,
    GunTracks,
    PlayerGun,
    drop_duplicate_hands,
    hammer_angle,
    is_gun,
    labels_swapped,
    to_game_area,
    to_points,
)
from level1.tests.hands import make_hand

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


def calibrated(hand=UP) -> tuple[PlayerGun, float]:
    """A PlayerGun whose neutral position is `hand`, and the time after calibrating."""
    gun = PlayerGun()
    frames = play(gun, [[hand]] * CALIBRATION_FRAMES)
    assert frames[-1].tracking == "ok"
    return gun, CALIBRATION_FRAMES * FRAME_MS


def test_the_aim_waits_in_the_centre_until_the_gun_is_held_still():
    gun = PlayerGun()
    moving = [[shifted(UP, 0.03 * (i % 4))] for i in range(CALIBRATION_FRAMES * 2)]
    frames = play(gun, moving)
    assert {f.tracking for f in frames} == {"calibrating"}
    assert {f.aim for f in frames} == {(0.5, 0.5)}
    still = play(gun, [[UP]] * CALIBRATION_FRAMES, start_ms=len(moving) * FRAME_MS)
    assert [f.tracking for f in still][-2:] == ["calibrating", "ok"]
    assert still[-1].aim == pytest.approx((0.5, 0.5))


def test_no_shots_while_calibrating():
    frames = play(PlayerGun(), [[UP], [DOWN], [DOWN], [DOWN]])
    assert not any(f.fired_at for f in frames)


def test_the_aim_follows_the_hand_mirrored_and_scaled():
    gun, start = calibrated()
    # Right in the camera is left on screen; down is down. 60 frames: past the smoothing.
    moved = play(gun, [[shifted(UP, 0.05, 0.03)]] * 60, start_ms=start)[-1]
    assert moved.aim[0] == pytest.approx(0.5 - AIM_GAIN * 0.05, abs=0.01)
    assert moved.aim[1] == pytest.approx(0.5 + AIM_GAIN * GAME_ASPECT * 0.03, abs=0.01)


def test_the_aim_ignores_the_thumb_and_index_labels():
    # A label swap moves the index tip onto the thumb; the aim uses neither.
    gun, start = calibrated()
    frames = play(gun, [[SWAPPED], [UP], [SWAPPED]], start_ms=start)
    assert all(f.aim == pytest.approx((0.5, 0.5), abs=0.01) for f in frames)


def test_recenter_calibrates_again_where_the_hand_is_now():
    gun, start = calibrated()
    elsewhere = shifted(UP, 0.1, 0.05)
    assert play(gun, [[elsewhere]] * 30, start_ms=start)[-1].aim != pytest.approx((0.5, 0.5))
    gun.recenter()
    frames = play(gun, [[elsewhere]] * CALIBRATION_FRAMES, start_ms=start + 30 * FRAME_MS)
    assert frames[0].tracking == "calibrating" and frames[-1].tracking == "ok"
    assert frames[-1].aim == pytest.approx((0.5, 0.5))


def test_a_shot_lands_where_the_gun_pointed_before_the_thumb_drop():
    gun, start = calibrated()
    sweep = [[shifted(UP, -0.01 * i)] for i in range(12)]
    dropped = [[shifted(DOWN, -0.12)]] * 2
    frames = play(gun, sweep + dropped, start_ms=start)
    shot = frames[-1]
    lookback = int(SHOT_AIM_LOOKBACK_S * 1000 // FRAME_MS)
    assert shot.fired_at == frames[-1 - lookback].aim
    assert shot.aim != shot.fired_at


def test_the_player_reports_tracking_for_pose_and_absence():
    gun, start = calibrated()
    open_hand = make_hand(middle=True, ring=True, pinky=True)
    frames = play(gun, [[UP], [open_hand], []], start_ms=start)
    assert [f.tracking for f in frames] == ["ok", "noPose", "lost"]
    assert frames[0].hand == UP and frames[2].hand is None
    assert frames[0].thumb_angle == pytest.approx(15, abs=0.1)


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
    frames = play(gun, [[DOWN], [DOWN], [UP], [DOWN], [DOWN]], start_ms=start)  # 2 shots, 100 ms
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
    fired = [k for k, frame in enumerate(replay(name)) if frame.fired_at]

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
    held = TRIGGER_MIN_SAMPLES
    t = start_ms
    for step, hand in (("up", up), ("down", down), ("up", up), ("down", down)):
        gun.calibrate_trigger(step)
        play(gun, [[hand]] * held, start_ms=t)
        t += held * FRAME_MS
    return gun.calibrate_trigger("done"), t


def fires(gun: PlayerGun, up, down, start_ms: float) -> bool:
    frames = play(gun, [[up]] * 3 + [[down]] * 3, start_ms=start_ms)
    return any(f.fired_at for f in frames)


def test_a_small_thumb_drop_fires_only_after_calibrating():
    up, down = make_hand(thumb_degrees=15), make_hand(thumb_degrees=45)  # never reaches 55
    gun, t = calibrated(up)
    assert not fires(gun, up, down, t)

    (trigger, problem), t = calibrate_trigger(gun, up, down, t + 6 * FRAME_MS)

    assert problem is None
    assert 15 < trigger.cocked_below_deg < trigger.fired_above_deg < 45
    assert fires(gun, up, down, t)


def test_a_thumb_resting_tilted_cocks_after_calibrating():
    up, down = make_hand(thumb_degrees=40), make_hand(thumb_degrees=80)  # 40 > 32: never cocked
    gun, t = calibrated(up)
    assert not fires(gun, up, down, t)

    (trigger, problem), t = calibrate_trigger(gun, up, down, t + 6 * FRAME_MS)

    assert problem is None
    assert trigger.cocked_below_deg > 40
    assert fires(gun, up, down, t)


def test_a_fold_toward_the_camera_calibrates_the_length_trigger():
    gun, t = calibrated(UP)
    (trigger, problem), t = calibrate_trigger(gun, UP, FOLDED, t)

    assert problem is None
    assert 0.3 <= trigger.folded_below < trigger.upright_above <= 1.0
    assert fires(gun, UP, FOLDED, t)


def test_calibration_keeps_the_trigger_when_up_and_down_look_the_same():
    gun, t = calibrated(UP)
    (trigger, problem), _ = calibrate_trigger(gun, UP, UP, t)

    assert trigger == DEFAULT_TRIGGER
    assert problem is not None and "drop it further" in problem


def test_calibration_needs_the_finger_gun_in_view():
    gun, t = calibrated(UP)
    gun.calibrate_trigger("up")
    play(gun, [[UP]] * TRIGGER_MIN_SAMPLES, start_ms=t)
    gun.calibrate_trigger("down")
    play(gun, [[]] * TRIGGER_MIN_SAMPLES, start_ms=t + 500)  # the hand left

    trigger, problem = gun.calibrate_trigger("done")

    assert trigger == DEFAULT_TRIGGER
    assert problem is not None and "in view" in problem


def test_reset_restores_the_default_trigger():
    up, down = make_hand(thumb_degrees=15), make_hand(thumb_degrees=45)
    gun, t = calibrated(up)
    (trigger, _), _ = calibrate_trigger(gun, up, down, t)
    assert trigger != DEFAULT_TRIGGER

    assert gun.calibrate_trigger("reset") == (DEFAULT_TRIGGER, None)
