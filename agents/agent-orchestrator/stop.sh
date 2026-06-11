#!/bin/bash
# stop.sh — Stop the running dashboard agent (uvicorn) process.
set -euo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

GREEN="\033[32m"; YELLOW="\033[33m"; RESET="\033[0m"

PID=$(ss -tlnp 2>/dev/null | grep ':8888' | grep -oP 'pid=\K[0-9]+' | head -1)
if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null && echo -e "${GREEN}[ OK ]${RESET}  Dashboard agent stopped (PID $PID)."
else
    echo -e "${YELLOW}[WARN]${RESET}  No running dashboard agent found on port 8888."
fi
