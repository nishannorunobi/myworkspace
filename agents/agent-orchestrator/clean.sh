#!/bin/bash
# clean.sh — Remove build artifacts so build.sh recreates a fresh environment.
# Removes : .venv, __pycache__, *.pyc, log files, empty memory dir
# Preserves: shared.conf, server.conf, config/, tasks.json (user data)
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

BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"; YELLOW="\033[33m"; RESET="\033[0m"
ok()   { echo -e "${GREEN}[ OK ]${RESET}  $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Agent Orchestrator — Clean             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}\n"

# Stop agent if running
if ss -tlnp 2>/dev/null | grep -q ':8888 '; then
    info "Stopping agent-orchestrator..."
    bash "$SCRIPT_DIR/stop.sh" 2>/dev/null || true
fi

# Virtual environment
if [ -d ".venv" ]; then
    rm -rf .venv
    ok "Removed .venv"
fi

# Python caches
find . -type d -name "__pycache__" | xargs rm -rf 2>/dev/null || true
find . -name "*.pyc" -delete 2>/dev/null || true
ok "Removed __pycache__ and *.pyc"

# Empty memory dir (build.sh creates it; runtime content is kept separately)
if [ -d "memory" ] && [ -z "$(ls -A memory 2>/dev/null)" ]; then
    rmdir memory
    ok "Removed empty memory/"
elif [ -d "memory" ]; then
    warn "memory/ has content — preserving (delete manually if needed)"
fi

# Logs
LOG_DIR="$WORKSPACE_ROOT/mountspace/logs/agent-orchestrator"
if [ -d "$LOG_DIR" ]; then
    rm -f "$LOG_DIR"/*.log
    ok "Cleared logs in mountspace/logs/agent-orchestrator/"
fi

echo -e "\n${GREEN}Clean complete.${RESET} Run ${BOLD}./build.sh${RESET} to rebuild.\n"
