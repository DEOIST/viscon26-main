#!/usr/bin/env bash
# End-to-end smoke test against a RUNNING app: API health, page HTML, JS/CSS bundles, 404s.
# It only reads (GET requests); it never creates data and never calls OpenAI.
#
#   scripts/smoke.sh [URL]          default http://localhost:8000
#   make prod && make smoke         the Docker smoke test referenced in AGENTS.md
#   make smoke URL=http://<vm-host>:<port>
set -euo pipefail

URL="${1:-http://localhost:8000}"
URL="${URL%/}"
failures=0

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# expect_status <path> <status> [text the body must contain]
expect_status() {
    local path="$1" want="$2" needle="${3:-}" body="" status
    if [[ -z "$needle" ]]; then
        # Status only: large binary files (the MediaPipe wasm) never pass through a variable.
        status="$(curl -sS -o /dev/null -w '%{http_code}' "$URL$path" 2>/dev/null)" || { fail "GET $path (connection failed)"; return; }
    else
        body="$(curl -sS -w '\n%{http_code}' "$URL$path" 2>/dev/null)" || { fail "GET $path (connection failed)"; return; }
        status="${body##*$'\n'}"
        body="${body%$'\n'*}"
    fi
    if [[ "$status" != "$want" ]]; then
        fail "GET $path → $status (expected $want)"
    elif [[ -n "$needle" && "$body" != *"$needle"* ]]; then
        fail "GET $path → $status but body lacks '$needle'"
    else
        pass "GET $path → $status"
    fi
}

echo "Smoke test against $URL"

# A freshly started container needs a few seconds; wait up to 30 s for the API.
for _ in $(seq 1 30); do
    curl -sf "$URL/api/health" >/dev/null 2>&1 && break
    sleep 1
done

expect_status /api/health 200 '"status":"ok"'
expect_status / 200 '<div id="root">'
expect_status /pages/index.js 200
expect_status /pages/index.css 200
expect_status /static/favicon.svg 200
# Every game scene is its own page (docs/ARCHITECTURE.md → Pages and navigation).
for page in enroll campus blackjack shooter graduation; do
    expect_status "/$page" 200 '<div id="root">'
    expect_status "/pages/$page.js" 200
done
# Read-only API checks that go through Redis. Never a POST here: story POSTs may spend credits.
expect_status /api/leaderboard 200 '['
expect_status /api/leaderboard/endings 200 '"counts"'
expect_status /api/runs/0123456789abcdef0123456789abcdef 404 'Run not found'
# The finger-detection engine must load in this image: MediaPipe, its system libraries and the
# hand model downloaded by the frontend build (issue #13).
expect_status /api/cv/status 200 '"available":true'
expect_status /static/models/hand_landmarker.task 200
expect_status /this-page-does-not-exist 404
expect_status /api/this-route-does-not-exist 404

if (( failures > 0 )); then
    echo "Smoke test FAILED ($failures check(s))."
    exit 1
fi
echo "Smoke test passed."
