#!/usr/bin/env bash
# Read-only smoke checks for Vite development or FastAPI serving the production build.
# Never sends a story POST or creates player/game records.
set -euo pipefail

URL="${1:-http://localhost:5173}"
URL="${URL%/}"
failures=0

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

expect_status() {
    local path="$1" want="$2" needle="${3:-}" body="" status
    if [[ -z "$needle" ]]; then
        status="$(curl -sS -o /dev/null -w '%{http_code}' "$URL$path" 2>/dev/null)" || { fail "GET $path (connection failed)"; return; }
    else
        body="$(curl -sS -w '\n%{http_code}' "$URL$path" 2>/dev/null)" || { fail "GET $path (connection failed)"; return; }
        status="${body##*$'\n'}"
        body="${body%$'\n'*}"
    fi
    if [[ "$status" != "$want" ]]; then
        fail "GET $path returned $status (expected $want)"
    elif [[ -n "$needle" && "$body" != *"$needle"* ]]; then
        fail "GET $path lacks '$needle'"
    else
        pass "GET $path returned $status"
    fi
}

echo "Smoke test against $URL"
for _ in $(seq 1 30); do
    curl -sf "$URL/api/db-health" >/dev/null 2>&1 && break
    sleep 1
done

expect_status /api/health 200 '"status":"ok"'
expect_status /api/config 200 '"graduationPreview":'
expect_status /api/db-health 200 '"status":"ok"'
expect_status / 200 '<div id="root">'
expect_status /favicon.svg 200 '<svg'
html="$(curl -fsS "$URL/")"
# Follow the actual generated module/styles URLs instead of assuming an esbuild index bundle.
while read -r asset; do
    [[ -n "$asset" ]] && expect_status "$asset" 200
done < <(printf '%s' "$html" | grep -oE '(src|href)="/[^" ]+\.(js|tsx|css)(\?[^" ]*)?"' | cut -d '"' -f 2)

expect_status /api/scoreboard 200 '['
expect_status /api/leaderboard 200 '['
expect_status /api/leaderboard/endings 200 '"counts"'
expect_status /api/runs/0123456789abcdef0123456789abcdef 404 'Run not found'
expect_status /api/this-route-does-not-exist 404

# Legacy documents are retained in the production image; Vite handles shell navigation itself.
if [[ "$html" != *'/@vite/client'* ]]; then
    for page in enroll campus blackjack shooter graduation; do
        expect_status "/$page" 200 '<div id="root">'
        expect_status "/pages/$page.js" 200
    done
    expect_status /static/mediapipe/vision_wasm_internal.wasm 200
    expect_status /this-page-does-not-exist 404
fi

if (( failures > 0 )); then
    echo "Smoke test FAILED ($failures checks)."
    exit 1
fi
echo "Smoke test passed."
