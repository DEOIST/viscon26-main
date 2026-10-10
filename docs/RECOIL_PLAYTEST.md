# Recoil playtest: 20261010-142709-729104

The original recoil detector fired **0 of 6** deliberate recoils. Replaying the corrected
implementation fires **all six once**, with **no shots elsewhere**, and holds the crosshair
at the shot position during recoil. This is a regression result for this recording; broader
player reliability still needs live playtests.

## Evidence

The capture contains **343 frames over 11.44 s**, at 640×480, roughly 30 fps. Its original
responses report 276 `ok`, 61 `lost`, and 6 `noPose` frames. Of the 282 observations of the
player, the old detector spent 258 `settling` and only 24 `ready`; it never entered `rising`.

Analysis included frame contact sheets, consecutive images around every recoil, and replay
of every landmark frame through `PlayerGun`, including other hands and tracking loss.
The recoil intervals below were labeled visually from the JPEGs, independently of the new
shot decisions. Frames 84–127 show camera adjustment; frames 128–171 show an upward aim held
for a while and then lowered. Neither interval is labeled as shooting.

| Recoil | Labeled frames | Original shots | Corrected shot frame | Time from labeled onset to confirmation |
|---|---|---|---|---|
| 1 | 20–26 | 0 | 23 | 89 ms |
| 2 | 57–61 | 0 | 60 | 99 ms |
| 3 | 175–181 | 0 | 177 | 69 ms |
| 4 | 221–226 | 0 | 225 | 150 ms |
| 5 | 268–273 | 0 | 270 | 66 ms |
| 6 | 319–324 | 0 | 321 | 69 ms |

These times use the recorded timestamps; they do not measure network or display latency.
The landmark-only regression fixture is
[`recoil_1.jsonl`](../backend/level1/tests/fixtures/captures/recoil_1.jsonl).
Original JPEGs remain in the ignored capture directory.

## Why the original detector failed

1. **It rarely armed.** A pointing index is foreshortened, and MediaPipe moves its estimated
   joints around while the visible hand is still. Requiring every index observation to stay
   within 0.10 knuckle spans of the last one rejected normal resting noise. Median baselines
   and separate palm/index tolerances allow the player to prepare a shot.
2. **The scale collapsed during rotation.** The middle-to-pinky span shrank from about 56 px
   to **15.7 px** in recoil 4. Dividing by that moving span inflated finger and thumb motion,
   exceeding the old single-frame jump limits. The scale now also uses wrist-to-knuckle
   distances, which remain visible when the fist turns edge-on.
3. **Real recoil moves the wrist.** The six attempts lift the palm by about **48–74 px**.
   The old limit allowed only 0.60 palm widths (roughly 30–36 px). Real shots therefore looked
   like forbidden aiming movement. Translation still cancels out of the index-to-knuckle
   vector; allowing wrist travel does not make simple whole-hand movement shoot.
4. **Thumb continuity rejected wrist pitching.** The thumb rotates with the wrist, even
   though it is not the trigger. Rejecting large simultaneous thumb/index changes confused
   that motion with label swaps. The new guard looks for the fingers jumping in opposite
   vertical directions, and the index joint must corroborate the tip's lift.
5. **Waiting for return can be impossible.** Recoil 2 has a bad index estimate at frame 59,
   a credible upright finger again at 60, and lost tracking at 61. Strong wrist recoil can
   confirm from two credible tip/joint observations before the return; a single misread
   between them does not destroy the gesture. Smaller flicks still need a prompt return.
6. **The visible cursor followed recoil.** Only the shot's aim had a look-back; the palm
   kept driving the crosshair and its smoothing velocity. Pending recoil now holds the
   pre-motion aim, and confirmation extends the hold by 180 ms, including brief pose loss.
   Held frames clear the filter's motion velocity so the return is not amplified as aiming.

## Regression checks

[`test_recoil.py`](../backend/level1/tests/test_recoil.py) checks exactly one shot inside each
of the six intervals, zero outside them, and a fixed cursor equal to `fired_at` from pending
recoil through the confirmation hold. It also checks that ordinary aiming in the same
capture still moves the crosshair without firing.

The four existing thumb-play fixtures remain negative examples for the live recoil trigger:
**zero recoil shots** across them. Replaying all five older source captures also produces
zero shots across **2,294 frames**. Synthetic checks continue to cover hand sizes, both hands,
camera aspect ratios, 15–60 fps, whole-hand translation, small upward aim changes held in
place, slow lifts, thumb drops/swaps, spikes, re-arming, cooldown, bystanders and tracking loss.
Returning with horizontal fingertip noise can re-arm without waiting for the recovery
timeout. A tip spike cannot collect a later separate upward twitch into one shot; joint
movement and peak direction are checked, and the initial rise ends on its first meaningful fall.

The strong path interprets a large, fast index/wrist pitch as shooting even before return.
An intentional aim change with that same motion is inherently ambiguous. Test additional
players' aiming and recoil styles before tightening or loosening those thresholds again;
keep their labeled recordings as regressions. See [the detector specification](SHOOTER_CV.md#trigger-upward-index-recoil).
