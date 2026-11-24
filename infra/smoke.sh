#!/usr/bin/env bash
# Post-deploy smoke check for a MyanLex stack. Fails (exit 1) on the first
# broken check. Run by .github/workflows/deploy.yml, or by hand:
#
#   API_URL=https://api.example.com CONSOLE_URL=https://console.example.com \
#   DOCS_URL=https://docs.example.com EXPECT_VERSION=<git sha> infra/smoke.sh
#
# EXPECT_VERSION  wait until the API reports this build (optional)
# SMOKE_API_KEY   a project key with text.normalize: one real request (optional)
# WAIT_SECONDS    how long to wait for the new build (default 600)
set -euo pipefail

: "${API_URL:?set API_URL}"
: "${CONSOLE_URL:?set CONSOLE_URL}"
API_URL="${API_URL%/}"
CONSOLE_URL="${CONSOLE_URL%/}"
DOCS_URL="${DOCS_URL:-}"
DOCS_URL="${DOCS_URL%/}"
WAIT_SECONDS="${WAIT_SECONDS:-600}"
EXPECT_VERSION="${EXPECT_VERSION:-}"

pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1" >&2; exit 1; }
# expect_ok <code> <success message> <failure message>
expect_ok() { if [ "$1" = 200 ]; then pass "$2"; else fail "$3"; fi; }
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" || true; }

echo "Smoke check: $CONSOLE_URL and $API_URL"

# 1. The new build is live (deploys finish after the webhook returns).
deadline=$((SECONDS + WAIT_SECONDS))
while :; do
  body=$(curl -fsS --max-time 10 "$API_URL/v1/health" 2>/dev/null || true)
  version=$(printf '%s' "$body" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
  if [ -n "$version" ] && { [ -z "$EXPECT_VERSION" ] || [ "$version" = "$EXPECT_VERSION" ]; }; then
    pass "API is up (version $version)"
    break
  fi
  [ "$SECONDS" -ge "$deadline" ] &&
    fail "API not serving ${EXPECT_VERSION:-a healthy build} after ${WAIT_SECONDS}s (last: ${version:-no response})"
  sleep 10
done

# 2. Readiness: PostgreSQL and Redis reachable from the API.
code=$(status "$API_URL/v1/health/ready")
expect_ok "$code" "API ready (database, redis)" "GET /v1/health/ready returned $code"

# 3. The console renders and its auth proxy reaches the API.
code=$(status "$CONSOLE_URL/login")
expect_ok "$code" "Sign-in page renders" "GET $CONSOLE_URL/login returned $code"
code=$(status -H "Origin: $CONSOLE_URL" "$CONSOLE_URL/api/auth/get-session")
expect_ok "$code" "Auth answers through the console" "GET /api/auth/get-session returned $code"

# 4. Docs, when deployed.
if [ -n "$DOCS_URL" ]; then
  code=$(status "$DOCS_URL/")
  expect_ok "$code" "Docs render" "GET $DOCS_URL/ returned $code"
fi

# 5. Operator metrics are not public: no token means no data.
code=$(status "$API_URL/internal/metrics")
case "$code" in
  401 | 403 | 404) pass "Metrics are not public ($code)" ;;
  *) fail "GET /internal/metrics without a token returned $code" ;;
esac

# 6. One real request with a smoke-test key, when provided.
if [ -n "${SMOKE_API_KEY:-}" ]; then
  body=$(curl -s --max-time 15 -w '\n%{http_code}' -X POST "$API_URL/v1/text/normalize" \
    -H "Authorization: Bearer $SMOKE_API_KEY" -H 'Content-Type: application/json' \
    --data '{"text":"မြန်မာ"}')
  code=${body##*$'\n'}
  expect_ok "$code" "Normalize request succeeds" "POST /v1/text/normalize returned $code"
else
  echo "  -    Normalize request skipped (SMOKE_API_KEY not set)"
fi

echo "All smoke checks passed."
