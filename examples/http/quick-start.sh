#!/bin/sh
# Server-side example. Do not enable shell tracing with real credentials.
set -eu
: "${MYANLEX_API_KEY:?Set MYANLEX_API_KEY in your environment}"
MYANLEX_API_URL=${MYANLEX_API_URL:-http://localhost:3001/v1}
# Reject header injection and ambiguous URL credentials/query/fragment syntax.
case "$MYANLEX_API_KEY" in
  *[!\!-\~]*) printf '%s\n' 'Use a non-empty ASCII key without whitespace.' >&2; exit 1 ;;
esac
case "$MYANLEX_API_URL" in
  *'@'*|*'?'*|*'#'*|*[[:space:]]*) printf '%s\n' 'Use an API URL without credentials, query or fragment.' >&2; exit 1 ;;
esac
# Use HTTPS for non-local deployments. No redirects or retries are enabled.
case "$MYANLEX_API_URL" in
  https://*|http://localhost:*|http://127.0.0.1:*) ;;
  *) printf '%s\n' 'Use HTTPS, or HTTP on loopback.' >&2; exit 1 ;;
esac
printf 'Authorization: Bearer %s\n' "$MYANLEX_API_KEY" |
  curl --silent --show-error --fail-with-body --max-time 30 \
  --header @- --header 'Content-Type: application/json' \
  --data '{"text":"က😀"}' "${MYANLEX_API_URL%/}/syllabify"
