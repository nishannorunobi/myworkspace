#!/bin/bash
# start_web.sh — Start the Dashboard Agent web interface.
# Usage: ./start_web.sh
# Config: server.conf  (HOST, PORT, LOG_DIR, LOG_LEVEL)
set -euo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$SCRIPT_DIR"

RED="\033[31m"; GREEN="\033[32m"; CYAN="\033[36m"; BOLD="\033[1m"; RESET="\033[0m"

if [ ! -d ".venv" ]; then
    echo -e "${CYAN}[INFO]${RESET}  .venv not found — running build.sh first..."
    bash "$SCRIPT_DIR/build.sh" || exit 1
fi
[ -f "../shared.conf" ] || { echo -e "${RED}[ERROR]${RESET} ../shared.conf not found."; exit 1; }
[ -f "server.conf" ]    || { echo -e "${RED}[ERROR]${RESET} server.conf not found."; exit 1; }

source ../shared.conf
source server.conf

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8888}"
LOG_DIR="$WORKSPACE_ROOT/mountspace/logs/myworkspace/agents/agent-orchestrator"
export LOG_DIR
LOG_LEVEL="${LOG_LEVEL:-info}"
LOG_FILE="$LOG_DIR/server_py.log"

mkdir -p "$LOG_DIR"
touch "$LOG_FILE" 2>/dev/null || true   # create if possible; never abort

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     Dashboard Agent — Web UI             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo -e "  ${GREEN}Open:${RESET}    http://localhost:${PORT}"
echo -e "  ${CYAN}Logs:${RESET}    ${LOG_FILE}"
echo -e "  ${CYAN}Level:${RESET}   ${LOG_LEVEL}"
echo -e "  Press Ctrl+C to stop.\n"

.venv/bin/uvicorn server:app \
    --host "$HOST" \
    --port "$PORT" \
    --log-level "$LOG_LEVEL" \
    --access-log \
    --no-use-colors \
    2>&1 | awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' | tee -a "$LOG_FILE"
