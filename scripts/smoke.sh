#!/usr/bin/env bash
# End-to-end smoke test against a RUNNING app: API health, page HTML, JS/CSS bundles, 404s.
# It only reads; it never creates or deletes data.
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
    local path="$1" want="$2" needle="${3:-}" body status
    body="$(curl -sS -w '\n%{http_code}' "$URL$path" 2>/dev/null)" || { fail "GET $path (connection failed)"; return; }
    status="${body##*$'\n'}"
    body="${body%$'\n'*}"
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
expect_status /this-page-does-not-exist 404
expect_status /api/this-route-does-not-exist 404

if (( failures > 0 )); then
    echo "Smoke test FAILED ($failures check(s))."
    exit 1
fi
echo "Smoke test passed."
