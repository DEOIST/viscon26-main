# Test fixtures

| File | Source | License |
|---|---|---|
| `pointing_up.jpg` | MediaPipe's test data, downloaded from `https://storage.googleapis.com/mediapipe-assets/pointing_up.jpg` (also in the MediaPipe repository under `mediapipe/tasks/testdata/vision/`) | Apache License 2.0, © Google LLC |

`tests/test_cv_mediapipe.py` runs the real hand model on it, and `make cv-check` streams it to a running server. It
shows one hand with the index finger up and the other fingers curled: MediaPipe measures an index angle of about 154°,
so it counts as a finger gun.
