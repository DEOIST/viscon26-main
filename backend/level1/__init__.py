"""Level 1, the Basisprüfung finger-gun shooter: its server side, the finger-detection engine
(docs/SHOOTER_CV.md). The browser streams camera frames to /api/cv/stream (router.py); cv.py runs
MediaPipe on them and gesture.py turns the hand into aim and shots. The game itself lives in
frontend/level1/. Wired into the app only by app/routers/__init__.py."""
