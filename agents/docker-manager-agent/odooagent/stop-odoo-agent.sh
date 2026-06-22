#!/bin/bash
# stop-odoo-agent.sh — Stop the odoo-agent (and the Odoo service it manages)
# inside myodoo-app. Called by docker-manager-agent on the HOST.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTAINER="myodoo-app"

# ── Mirror logging ─────────────────────────────────────────────────────────────
source "$WORKSPACE_ROOT/init/create_logging_path.sh"
setup_logging
# ──────────────────────────────────────────────────────────────────────────────

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "[stop-odoo-agent] Container $CONTAINER is not running — nothing to stop."
    exit 0
fi

# Stop the Odoo service first (PID file written by tools/odoo/start.sh), then the
# agent. The [x] bracket trick keeps pkill from matching itself.
docker exec "$CONTAINER" bash -c '
    if [ -f /tmp/odoo.pid ]; then
        kill "$(cat /tmp/odoo.pid)" 2>/dev/null || true
        rm -f /tmp/odoo.pid
    fi
    pkill -f "[o]doo-bin"           2>/dev/null || true
    pkill -f "[u]vicorn server:app" 2>/dev/null || true
    echo "[OK] odoo-agent + Odoo stopped."
'
