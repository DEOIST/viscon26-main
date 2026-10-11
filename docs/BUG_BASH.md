# Bug Bash: current local implementation

This is the current reference for the level 1 changes on `agent/pinch-calibration`.
The original finger-gun design in SHOOTER_CV.md is historical reference. These changes
are local and have not been pushed or merged.

## Game and visuals

- Year 1 / the internal `shooter` slot is displayed as **Introduction to Programming - Bug
  Bash**, like Year 2's "Probability Class - Gauss Jack": on the hub, the diploma, the
  in-game banner and the advisor's intro line.
- The background is a restrained navy IDE with a file explorer, syntax-colored code,
  minimap, terminal and scrollbar. Code scrolls during the round; the line counter
  advances. The earlier perspective tunnel and its wires were removed.
- Bugs have three retro pixel-alien silhouettes and four palettes. Pinch and throw them.
- Green working-code cards have black cartoon bombs. Fire travels down the rope toward
  the bomb over nine seconds (`APPROACH_SECONDS`). Slapping or swiping can extinguish the fuse.
- Six side interrupters have different skin/hair, glasses, cap, tie or beard, and varied
  speech bubbles. One appears every 6.5–11 seconds; it leaves after 4.5 seconds if ignored.
- The tracked hand is a filled cartoon hand with a solid palm, rounded tapered fingers,
  outline and nail highlights. There is no crosshair or browser cursor over the canvas.
- The hand takes the player's avatar skin colour (`frontend/level1/handColors.ts`); its outline,
  nails and crease are shades of it. Very dark skin, including the builder's "Deep brown", gets a
  light rim instead of a dark outline, which would vanish into the near-black editor.

## Pinch, grab and throw

Pinching still uses the distance between thumb and index tips, normalized by palm width.
Calibration asks for apart (2 s), pinched (1.5 s), apart (1.5 s), pinched (1.5 s), ignoring
10 initial visible frames per step. It needs at least 10 samples per position and a gap
of 0.15 palm widths between the open 20th and closed 80th percentiles. Closing at 30%
of that gap confirms a grab after two frames; reopening at 70% rearms it.

Three practice pinches complete calibration, followed by three practice bugs to throw.
`Enter` skips; `T` repeats calibration during warm-up. Collection suppresses game grabs.

Only bugs can be grabbed. Grab radii are 1.8 times their original size, also in practice.
Held bugs follow the thumb/index midpoint and pause their approach. Moving 100 game
pixels or releasing at 650 pixels/s throws them; a slower release drops them back.
Tracking loss gets 350 ms of grace before dropping; changing input mode also drops.

## Slaps and gentle swipes

Fast slaps retain the broad effect: save all currently burning code and knock out the
visible interrupter, without aiming. Slow slides affect only the code cards and
interrupter bodies they touch: anywhere on a card (115 px around its centre at scale 1,
`CODE_SWIPE_RADIUS`) or its flame (30 px), and an interrupter within 110 px of its body
(`INTERRUPTER_SWIPE_RADIUS`). The flame tip alone was too small to hit with a hand. Neither gesture throws a held bug.

- Landmark movement uses the centroid of **all 21 hand points**.
- Gentle slides require a non-pinching hand, lateral movement of 12% of camera width
  within 0.9 s, at least 0.12 s of movement, average lateral speed of **0.3 camera
  widths/s**, and net travel at least 60% of the total path (more sensitive after
  playtests: they were 18%, 0.18 s, 0.45 and 70%). Individual finger-extension
  tests are no longer required.
- Slide collision uses the swept convex hull of the whole hand between camera frames:
  palm, thumb and fingers, with a small margin. It is independent of pinch targeting.
- Fast tracked slaps use 35% travel in 0.25 s. Lost/reappearing hands require speed
  evidence (1.5 camera widths/s) as well as displacement, instead of merely reappearing.
- Back-facing/blurred hands also use raw frame changes: at least 25% of the watched area
  changes, plus evidence that the changed region moves at least 0.9 camera widths/s.
  The image-region center must move at least 2% of frame width between consecutive
  qualifying frames; lighting changes or a stationary noisy outline alone are insufficient.
  A visible tracked fast move can provide speed evidence instead.
- Each has its own 0.6-second cooldown. They used to share one, so a slide (often just
  the wind-up) silently swallowed the slap right after it. The hand-settling requirement
  was removed because it blocked detection. Fast slaps clear pending slide samples. Pinching, tracking loss
  and changing hands clear slide samples.
- Hit text appears only when code is saved or a character is knocked out; empty swipes
  produce no "SWISH" or slap message.

These thresholds need human camera tuning. Returning a hand can still count if it meets
speed/displacement rules; pose noise or fast body movement can still cause false positives.
Raw motion is a lightweight image-change estimate, not a full optical-flow model.

## Scoring and controls

The round lasts 60 seconds. Bugs award 10 points; saved code awards 25; streaks add 5.
Interrupters award 15. Escaped bugs deduct 5, exploded code deducts 15, missed grabs deduct
2. The running total never drops below zero (`addPoints` in `score.ts`), so early mistakes don't
leave a debt and a round with real catches always pays some ECTS. The 0–100 score sent to the shell
is points / `PAR_POINTS` (325, scaled from 420 when the slower tuning cut a round from 44 to 34
targets), and the year pays that share of its 60 ECTS. Legacy internal target kinds remain: `question` = bug, `deadline` = code bomb, `coffee`
no longer spawns. Results retain `points`, `hits`, `shots`, plus `savedCode` and `interruptions`.

- `F` / fullscreen button: toggle fullscreen. `Esc`: exit fullscreen. Phaser targets the
  actual game host; viewport-sized `:fullscreen` styles remove embedded size constraints.
- `M`: mouse fallback. Hold, drag and release bugs; `Space` performs a broad slap.
  Pointer coordinates use the actual canvas bounds, including fullscreen letterboxing.
- `C`: reset hand smoothing. `R`: existing development-only recording toggle.

## Stream contract

The types live in `backend/level1/schemas.py` and `frontend/level1/input/cvStream.ts`.
Existing routes and wire step names remain unchanged. Additions to `/api/cv/stream`:

| Field | Current meaning |
|---|---|
| `pinching` | Held pinch state, cleared after crossing the reopening threshold |
| `slap` | Fast broad slap direction, `left` / `right`, otherwise null |
| `slide` | Local slow-swipe event, otherwise null |
| `slide.direction` | Mirrored direction |
| `slide.path` | Whole-hand centroid path in mirrored game coordinates |
| `slide.radius` | Small contact tolerance, fraction of game width |
| `slide.outlines` | All 21 mapped hand points for each swept frame |
| `thresholds.pinchOpenAbove` | Calibrated reopening distance in palm widths |
| `thresholds.pinchClosedBelow` | Calibrated pinching distance in palm widths |

`up` / `down` calibration steps now mean apart / pinched. Legacy thumb fields remain for
compatibility; old thumb geometry remains in the backend, but the active controller is pinch-based.

## Files and verification

Game: `ShooterScene.ts`, `config.ts`, `CodeTargets.ts`, `SlapWalkers.ts`, `Backdrop.ts`,
`handOverlay.ts`, `swipeHit.ts`, and the level1 input/calibration files. CV: `gesture.py`,
`cv.py`, `schemas.py`. Shell: shared game config, character labels, Phaser createGame,
fullscreen styles in both shell stylesheets.

Automated verification for the branch PR includes `make check`, `make build`, and
`make smoke URL=http://localhost:8000`. Updated tests cover active pinch calibration,
hold state, cooldown, direct fingertip aiming and stationary-hand rejection, plus
whole-hand slide footprints and target collision between frames. Recorded thumb-drop
regressions remain covered on the retained legacy tracker. Live webcam gesture tuning
and a browser fullscreen demo still need human verification. Docker is unavailable,
so the Docker image itself is not verified.
The development server uses SQLite in `/tmp/ethlife-dev.sqlite3`, in-memory Redis and
`AI_MODE=off`; no source `.env` files were changed and no OpenAI credits were spent.
