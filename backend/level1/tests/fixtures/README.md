# Test fixtures

| File | Source | License |
|---|---|---|
| `pointing_up.jpg` | MediaPipe's test data, downloaded from `https://storage.googleapis.com/mediapipe-assets/pointing_up.jpg` (also in the MediaPipe repository under `mediapipe/tasks/testdata/vision/`) | Apache License 2.0, © Google LLC |
| `aim1.jpg` … `aim4.jpg`, `shoot1.jpg` | Our own photos of the gesture (the finger-gun prototype), scaled to 720×480 | ours |
| `captures/recoil_2.jsonl` | Landmarks of `20261010-153125-043562`, six clear recoil gestures with sideways aim and brief pose misreads, no images | ours |
| `captures/recoil_1.jsonl` | Landmarks of `20261010-142709-729104`, six recoil attempts and ordinary aiming, no images | ours |
| `captures/play_1.jsonl` … `captures/play_4.jsonl` | Landmarks of four recordings of real play in the game (`backend/captures/`, R key), no images | ours |

`tests/test_cv_mediapipe.py` runs the real hand model on the photos, and `make cv-check` streams `pointing_up.jpg` to a
running server. It shows one hand with the index finger up and the other fingers curled, so it counts as a finger gun.

- `aim*.jpg`: index finger pointing at the screen, thumb up like a cocked hammer, other fingers curled. In aim2 the
  finger points image-left, in aim1 at the camera, in aim3 image-right.
- `shoot1.jpg`: the same hand with the thumb dropped forward onto the index finger.
- `captures/play_*.jsonl`: one line per camera frame (`t_ms`, `size`, and the 21 image landmarks of every hand
  MediaPipe reported, duplicates included). `tests/test_gesture.py` replays them through `PlayerGun(trigger="thumb")` and checks the
  shots against the frames where the thumb was visibly down, labeled by eye in the recorded images, each frame
  compared with the ones before it (a thumb folded toward the camera is easy to mistake for an upright one). Re-run them
  whenever a threshold changes.

Live sessions shoot with an upward index/wrist recoil. Small flicks require a return; a
pronounced joint-supported wrist pitch can confirm earlier, before the returning hand is
lost. The thumb recordings remain regression fixtures for the explicit legacy trigger, and
`tests/test_recoil.py` also replays them with the live trigger to ensure they do not fire.

`captures/recoil_1.jsonl` preserves all 343 frames of the recoil playtest, including lost
hands and bystanders, without the images or recorded decisions. The six recoil intervals
are frames **20–26, 57–61, 175–181, 221–226, 268–273, 319–324**, labeled by comparing the
original JPEGs. Every interval must fire once; no other frame may fire. The second interval
includes a misread index followed by lost tracking. Cursor tests include actual wrist travel
and pose loss on return. See [the analysis](../../../../docs/RECOIL_PLAYTEST.md). More players'
recordings are still needed to measure reliability across different hands and shooting styles.

`captures/recoil_2.jsonl` preserves all 329 frames of the follow-up capture. Its visually
labeled clear recoil intervals are **41–44, 81–84, 132–139, 152–155, 222–225, 287–290**.
All six must fire once, without other shots. The final shot starts with the barrel pointing
right. Brief pose misreads at 81 and 219–222 must hold the crosshair without supplying shot
evidence. Smaller movements near frames 26 and 202 are ambiguous and remain unlabeled;
these fixtures measure the clear gestures, rather than all possible player intentions.
