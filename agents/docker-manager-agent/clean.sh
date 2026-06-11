#!/bin/bash
# clean.sh — Remove build artifacts so build.sh recreates a fresh environment.
# Removes : .venv, __pycache__, *.pyc, log files, empty memory dir
# Preserves: shared.conf, server.conf (user data)
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
echo -e "${BOLD}║   Docker Manager Agent — Clean           ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}\n"

# Stop agent if running
if pkill -f "$SCRIPT_DIR/.venv" 2>/dev/null; then
    ok "Stopped docker-manager-agent"
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

# Empty memory dir
if [ -d "docker_agent/memory" ] && [ -z "$(ls -A docker_agent/memory 2>/dev/null)" ]; then
    rmdir docker_agent/memory
    ok "Removed empty docker_agent/memory/"
elif [ -d "docker_agent/memory" ]; then
    warn "docker_agent/memory/ has content — preserving (delete manually if needed)"
fi

# Logs
LOG_DIR="$WORKSPACE_ROOT/mountspace/logs/docker-manager-agent"
if [ -d "$LOG_DIR" ]; then
    rm -f "$LOG_DIR"/*.log
    ok "Cleared logs in mountspace/logs/docker-manager-agent/"
fi

echo -e "\n${GREEN}Clean complete.${RESET} Run ${BOLD}./build.sh${RESET} to rebuild.\n"
