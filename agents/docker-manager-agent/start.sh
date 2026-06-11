#!/bin/bash
# start.sh — Start the Docker Orchestrator Agent.
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

RED="\033[31m"; GREEN="\033[32m"; BOLD="\033[1m"; RESET="\033[0m"

if [ ! -d ".venv" ]; then
    echo -e "\033[36m[INFO]\033[0m  .venv not found — running build.sh first..."
    bash "$SCRIPT_DIR/build.sh" || { echo -e "${RED}[ERROR]${RESET} build.sh failed."; exit 1; }
fi
[ -f "../shared.conf" ] || { echo -e "${RED}[ERROR]${RESET} ../shared.conf not found."; exit 1; }
[ -f "server.conf" ]    || { echo -e "${RED}[ERROR]${RESET} server.conf not found."; exit 1; }

source ../shared.conf
source server.conf

[ -n "${ANTHROPIC_API_KEY:-}" ] || { echo -e "${RED}[ERROR]${RESET} ANTHROPIC_API_KEY not set in environment — run: export ANTHROPIC_API_KEY=..."; exit 1; }
export ANTHROPIC_API_KEY

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8889}"

if ss -tlnp 2>/dev/null | grep -q ":${PORT} " || nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
    echo -e "${GREEN}[  OK  ]${RESET} Docker Manager Agent already running on port ${PORT}."
    exit 0
fi
LOG_LEVEL="${LOG_LEVEL:-info}"
LOG_FILE="$WORKSPACE_ROOT/mountspace/logs/myworkspace/agents/docker-manager-agent/docker_agent/server_py.log"

mkdir -p "$(dirname "$LOG_FILE")"

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Docker Manager Agent                   ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo -e "  ${GREEN}API:${RESET}  http://localhost:${PORT}"
echo -e "  ${GREEN}Docs:${RESET} http://localhost:${PORT}/docs"
echo -e "  ${GREEN}Log:${RESET}  ${LOG_FILE}"
echo -e "  Press Ctrl+C to stop.\n"

cd docker_agent
../.venv/bin/uvicorn server:app \
    --host "$HOST" \
    --port "$PORT" \
    --log-level "$LOG_LEVEL" \
    --access-log \
    --no-use-colors \
    2>&1 | awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' | tee -a "$LOG_FILE"
