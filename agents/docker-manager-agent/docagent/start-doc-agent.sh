#!/bin/bash
# Start the doc-agent process inside plane-aio via docker exec.
set -euo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTAINER="plane-aio"
AGENT_DIR="/doc-agent"
LOG_FILE="$WORKSPACE_ROOT/mountspace/logs/myworkspace/agents/docker-manager-agent/docagent/server_py.log"

if ! docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    echo "[ERROR] Container $CONTAINER is not running." >&2
    exit 1
fi

# Build venv if missing, Python broken, or uvicorn not installed (Alpine: sh not bash)
if ! docker exec "$CONTAINER" sh -c "test -f $AGENT_DIR/.venv/bin/uvicorn" &>/dev/null; then
    echo "[INFO] Building doc-agent venv inside container..."
    docker exec "$CONTAINER" rm -rf "$AGENT_DIR/.venv"
    docker exec "$CONTAINER" sh "$AGENT_DIR/build.sh"
fi

# Kill any existing doc-agent uvicorn (idempotent).
# The [u]vicorn bracket trick prevents pkill from matching its own command line.
docker exec "$CONTAINER" sh -c \
    "pkill -f '[u]vicorn server:app' 2>/dev/null; sleep 0.3; echo ok"

# Start fresh; route logs to mountspace on the host via nohup+disown.
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"   # create if missing, never overwrite existing
docker exec "$CONTAINER" sh -c \
    "cd $AGENT_DIR && . ./agent.conf && \
     .venv/bin/uvicorn server:app \
        --host 0.0.0.0 --port \${PORT:-8893} \
        --no-use-colors --access-log" \
    < /dev/null 2>&1 \
    | awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' >> "$LOG_FILE" &
disown

echo "[OK] Doc agent started inside $CONTAINER."
