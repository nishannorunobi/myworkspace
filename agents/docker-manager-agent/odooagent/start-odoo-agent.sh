#!/bin/bash
# start-odoo-agent.sh — Start the odoo-agent inside myodoo-app.
# Called by docker-manager-agent on the HOST.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTAINER="myodoo-app"
AGENT_PATH="/myodoo/odoo-agent"

# ── Mirror logging ─────────────────────────────────────────────────────────────
source "$WORKSPACE_ROOT/init/create_logging_path.sh"
setup_logging
# ──────────────────────────────────────────────────────────────────────────────

# ── Ensure container is running ───────────────────────────────────────────────
if ! docker container inspect "$CONTAINER" &>/dev/null; then
    echo "[start-odoo-agent] Container $CONTAINER not found — starting it..."
    bash "$WORKSPACE_ROOT/projectspace/myodoo/dockerspace/host_scripts/start.sh"
    sleep 2
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "[start-odoo-agent] Starting container $CONTAINER..."
    docker start "$CONTAINER"
    sleep 2
fi

# ── Run build if dependencies are missing ─────────────────────────────────────
if ! docker exec "$CONTAINER" python3 -c 'import fastapi, uvicorn' 2>/dev/null; then
    echo "[start-odoo-agent] dependencies not found — running build.sh first..."
    docker exec "$CONTAINER" bash "$AGENT_PATH/build.sh" 2>&1
fi

# ── Kill any existing uvicorn on port 8896 ────────────────────────────────────
docker exec "$CONTAINER" bash -c "
    pid=\$(lsof -ti:8896 2>/dev/null || true)
    [ -n \"\$pid\" ] && kill \$pid 2>/dev/null || true
" 2>/dev/null || true

# server_py.log is written by the odoo-agent's own loguru sink INSIDE the container.
UVICORN_LOG="$WORKSPACE_ROOT/mountspace/logs/myworkspace/projectspace/myodoo/odoo-agent/server_py.log"

# ── Start odoo-agent ──────────────────────────────────────────────────────────
echo "[start-odoo-agent] Launching odoo-agent (server log → $UVICORN_LOG, written by the container)..."
docker exec "$CONTAINER" bash -c \
    "cd $AGENT_PATH && set -a && source agent.conf 2>/dev/null || true; set +a && \
     uvicorn server:app --host 0.0.0.0 --port 8896 --workers 1 --no-use-colors" \
    < /dev/null 2>&1 \
    | awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' \
    | tee -a "$LOG_FILE" &
disown

echo "[start-odoo-agent] Odoo agent started. Dashboard: http://localhost:8896"
