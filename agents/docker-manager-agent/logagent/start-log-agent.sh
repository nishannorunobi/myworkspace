#!/bin/bash
# start-log-agent.sh — Start the log-agent inside mylog_analytics-container.
# Called by docker-manager-agent on the HOST.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTAINER="mylog_analytics-container"
AGENT_PATH="/mylog_analytics/log-agent"

# ── Mirror logging ─────────────────────────────────────────────────────────────
source "$WORKSPACE_ROOT/init/create_logging_path.sh"
setup_logging
# ──────────────────────────────────────────────────────────────────────────────

# ── Ensure container is running ───────────────────────────────────────────────
if ! docker container inspect "$CONTAINER" &>/dev/null; then
    echo "[start-log-agent] Container $CONTAINER not found — starting it..."
    bash "$WORKSPACE_ROOT/projectspace/mylog_analytics/dockerspace/host_scripts/start.sh"
    sleep 2
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "[start-log-agent] Starting container $CONTAINER..."
    docker start "$CONTAINER"
    sleep 2
fi

# ── Run build if venv is missing ──────────────────────────────────────────────
if ! docker exec "$CONTAINER" test -d "$AGENT_PATH/.venv" 2>/dev/null; then
    echo "[start-log-agent] venv not found — running build.sh first..."
    docker exec "$CONTAINER" bash "$AGENT_PATH/build.sh" 2>&1
fi

# ── Kill any existing uvicorn on port 8893 ───────────────────────────────────
docker exec "$CONTAINER" bash -c "
    pid=\$(lsof -ti:8893 2>/dev/null || true)
    [ -n \"\$pid\" ] && kill \$pid 2>/dev/null || true
" 2>/dev/null || true

# Uvicorn mirror log: projectspace/mylog_analytics/log-agent/server_py.log
UVICORN_LOG="$WORKSPACE_ROOT/mountspace/logs/myworkspace/projectspace/mylog_analytics/log-agent/server_py.log"
mkdir -p "$(dirname "$UVICORN_LOG")"

# ── Start log-agent ───────────────────────────────────────────────────────────
echo "[start-log-agent] Launching log-agent (log → $UVICORN_LOG)..."
docker exec "$CONTAINER" bash -c \
    "cd $AGENT_PATH && source agent.conf 2>/dev/null || true && \
     .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8893 --workers 1 --no-use-colors" \
    < /dev/null 2>&1 \
    | awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' \
    | tee -a "$LOG_FILE" >> "$UVICORN_LOG" &
disown

echo "[start-log-agent] Log agent started. Dashboard: http://localhost:8893"
