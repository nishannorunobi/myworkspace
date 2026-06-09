#!/bin/bash
# Start the db-agent process inside mypostgresql_db-container via docker exec.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTAINER="mypostgresql_db-container"
AGENT_DIR="/mypostgresql_db/db-agent"
SHARED_CONF="$SCRIPT_DIR/../../shared.conf"
LOG_FILE="$WORKSPACE_ROOT/mountspace/logs/db-agent/server.log"

if ! docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    echo "[ERROR] Container $CONTAINER is not running." >&2
    exit 1
fi

# Build if venv is missing or its Python interpreter is broken
if ! docker exec "$CONTAINER" bash -c "$AGENT_DIR/.venv/bin/python3 --version" &>/dev/null; then
    echo "[INFO] Building db-agent venv inside container..."
    docker exec "$CONTAINER" rm -rf "$AGENT_DIR/.venv"
    # On a fresh container the first apt-get install can fail mid-dpkg-configure.
    # Retry once — packages are cached so the second run always completes.
    docker exec "$CONTAINER" bash "$AGENT_DIR/build.sh" \
        || docker exec "$CONTAINER" bash "$AGENT_DIR/build.sh"
else
    # Venv exists — sync packages in case requirements.txt changed since last build
    echo "[INFO] Syncing db-agent packages..."
    docker exec "$CONTAINER" bash -c "$AGENT_DIR/.venv/bin/pip install --quiet -r $AGENT_DIR/requirements.txt"
fi

# Inject API key from shared.conf into the container's agent.conf (idempotent)
if [ -f "$SHARED_CONF" ]; then
    source "$SHARED_CONF"
    docker exec "$CONTAINER" bash -c "
        grep -q 'ANTHROPIC_API_KEY' $AGENT_DIR/agent.conf 2>/dev/null \
            && sed -i 's|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|' $AGENT_DIR/agent.conf \
            || echo 'ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY' >> $AGENT_DIR/agent.conf"
fi

# Kill any existing db-agent uvicorn (idempotent).
# The [u]vicorn bracket trick prevents pkill from matching its own command line.
docker exec "$CONTAINER" bash -c \
    "pkill -f '[u]vicorn server:app' 2>/dev/null; sleep 0.3; echo ok"

# Start fresh; route logs to mountspace on the host via nohup+disown.
mkdir -p "$(dirname "$LOG_FILE")"
docker exec "$CONTAINER" bash -c \
    "cd $AGENT_DIR && source agent.conf && \
     .venv/bin/uvicorn server:app \
        --host 0.0.0.0 --port \${PORT:-8890} \
        --no-use-colors --access-log" \
    < /dev/null 2>&1 \
    | awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' >> "$LOG_FILE" &
disown

echo "[OK] DB agent started inside $CONTAINER."
