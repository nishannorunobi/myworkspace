#!/bin/bash
# stop.sh — Stop a running workspace-agent process.
set -euo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

GREEN="\033[32m"; YELLOW="\033[33m"; RESET="\033[0m"

if pkill -f "workspace/agent.py --daemon" 2>/dev/null; then
    echo -e "${GREEN}[ OK ]${RESET}  Workspace agent stopped."
else
    echo -e "${YELLOW}[WARN]${RESET}  No running workspace agent found."
fi
