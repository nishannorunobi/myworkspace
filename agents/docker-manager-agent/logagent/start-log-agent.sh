#!/bin/bash
# start-log-agent.sh — Start the log-agent inside mylog_analytics-container.
# Called by docker-manager-agent on the HOST.
set -euo pipefail

CONTAINER="mylog_analytics-container"
AGENT_PATH="/mylog_analytics/log-agent"
LOG_DIR="/home/nishan/myworkspace/mountspace/logs/log-agent"
LOG_FILE="$LOG_DIR/server.log"

mkdir -p "$LOG_DIR"

# ── Ensure container is running ───────────────────────────────────────────────
if ! docker container inspect "$CONTAINER" &>/dev/null; then
    echo "[start-log-agent] Container $CONTAINER not found — starting it..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
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
    docker exec "$CONTAINER" bash "$AGENT_PATH/build.sh" 2>&1 | tee -a "$LOG_FILE"
fi

# ── Kill any existing uvicorn on port 8893 ───────────────────────────────────
docker exec "$CONTAINER" bash -c "
    pid=\$(lsof -ti:8893 2>/dev/null || true)
    [ -n \"\$pid\" ] && kill \$pid 2>/dev/null || true
" 2>/dev/null || true

# ── Start log-agent ───────────────────────────────────────────────────────────
echo "[start-log-agent] Launching log-agent..."
docker exec -d "$CONTAINER" bash -c "
    cd $AGENT_PATH && \
    exec > >(awk '{ print strftime(\"[%Y-%m-%d %H:%M:%S]\"), \$0; fflush() }' | tee -a $AGENT_PATH/memory/server.log) 2>&1 && \
    .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8893 --workers 1
"

echo "[start-log-agent] Log agent started. Dashboard: http://localhost:8893"
