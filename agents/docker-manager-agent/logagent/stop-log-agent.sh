#!/bin/bash
# stop-log-agent.sh — Stop the log-agent and its Loki/Promtail/Grafana stack
# inside mylog_analytics-container. Called by docker-manager-agent on the HOST.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTAINER="mylog_analytics-container"

# ── Mirror logging ─────────────────────────────────────────────────────────────
source "$WORKSPACE_ROOT/init/create_logging_path.sh"
setup_logging
# ──────────────────────────────────────────────────────────────────────────────

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "[stop-log-agent] Container $CONTAINER is not running — nothing to stop."
    exit 0
fi

# Stop the stack first (PID files written by the agent's autostart hook),
# then the agent itself. The [x] bracket trick keeps pkill from matching itself.
docker exec "$CONTAINER" bash -c '
    for p in /tmp/grafana.pid /tmp/promtail.pid /tmp/loki.pid; do
        if [ -f "$p" ]; then
            kill "$(cat "$p")" 2>/dev/null || true
            rm -f "$p"
        fi
    done
    pkill -f "[g]rafana-server"   2>/dev/null || true
    pkill -f "[p]romtail -config" 2>/dev/null || true
    pkill -f "[l]oki -config"     2>/dev/null || true
    pkill -f "[u]vicorn server:app" 2>/dev/null || true
    echo "[OK] log-agent + Loki/Promtail/Grafana stopped."
'
