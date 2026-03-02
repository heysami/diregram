#!/usr/bin/env bash
set -euo pipefail

APP_BASE_URL="${1:-${DIREGRAM_APP_BASE_URL:-}}"
SYNC_SECRET="${MCP_SSH_SYNC_SECRET:-}"
OUT_FILE="${AUTHORIZED_KEYS_FILE:-$HOME/.ssh/authorized_keys}"

if [ -z "$APP_BASE_URL" ]; then
  echo "Missing app base URL. Pass as first arg or set DIREGRAM_APP_BASE_URL." >&2
  exit 1
fi
if [ -z "$SYNC_SECRET" ]; then
  echo "Missing MCP_SSH_SYNC_SECRET env var." >&2
  exit 1
fi

URL="${APP_BASE_URL%/}/api/rag/mcp-ssh/authorized-keys"
TMP="$(mktemp)"

cleanup() {
  rm -f "$TMP"
}
trap cleanup EXIT

curl -fsS -H "x-mcp-ssh-sync-secret: $SYNC_SECRET" "$URL" > "$TMP"

mkdir -p "$(dirname "$OUT_FILE")"
chmod 700 "$(dirname "$OUT_FILE")"
cat "$TMP" > "$OUT_FILE"
chmod 600 "$OUT_FILE"

echo "Updated $OUT_FILE"

