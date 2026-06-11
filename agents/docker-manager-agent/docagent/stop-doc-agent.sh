#!/bin/bash
# Stop the doc-agent process inside plane-aio via docker exec.
set -euo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

CONTAINER="plane-aio"

if ! docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    echo "[WARN] Container $CONTAINER is not running — nothing to stop."
    exit 0
fi

docker exec "$CONTAINER" bash -c \
    "pkill -f '[u]vicorn server:app' 2>/dev/null \
     && echo '[OK] Doc agent stopped.' \
     || echo '[WARN] No running doc-agent found.'"
