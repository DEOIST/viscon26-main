# Test fixtures

| File | Source | License |
|---|---|---|
| `pointing_up.jpg` | MediaPipe's test data, downloaded from `https://storage.googleapis.com/mediapipe-assets/pointing_up.jpg` (also in the MediaPipe repository under `mediapipe/tasks/testdata/vision/`) | Apache License 2.0, © Google LLC |
| `aim1.jpg` … `aim4.jpg`, `shoot1.jpg` | Our own photos of the gesture (the finger-gun prototype), scaled to 720×480 | ours |
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

Live sessions now shoot with an upward index recoil, confirmed as the finger starts returning.
The thumb recordings remain regression fixtures for the explicit legacy trigger, and
`tests/test_recoil.py` also replays them with the live recoil trigger to ensure they do not fire.
Recoil thresholds currently use synthetic motion tests; record several players' deliberate
recoils and ordinary aiming with **R** to tune them against real labeled motion.
