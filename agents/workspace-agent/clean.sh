#!/bin/bash
# clean.sh — Remove build artifacts so build.sh recreates a fresh environment.
# Removes : .venv, __pycache__, *.pyc, log files
# Preserves: shared.conf, workspace/memory/ (agent knowledge DB — runtime data)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$SCRIPT_DIR"

BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"; YELLOW="\033[33m"; RESET="\033[0m"
ok()   { echo -e "${GREEN}[ OK ]${RESET}  $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Workspace Agent — Clean                ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}\n"

# Stop agent if running
if pgrep -f "workspace/agent.py --daemon" &>/dev/null; then
    info "Stopping workspace agent..."
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

# Logs
LOG_DIR="$WORKSPACE_ROOT/mountspace/logs/workspace-agent"
if [ -d "$LOG_DIR" ]; then
    rm -f "$LOG_DIR"/*.log
    ok "Cleared logs in mountspace/logs/workspace-agent/"
fi

# Note: mountspace/workspace-agent/memory/ is the agent's knowledge DB (scanner.db,
# todos, knowledge) — this is runtime data, not a build artifact. Skipping.
# To also wipe memory: rm -rf "$WORKSPACE_ROOT/mountspace/workspace-agent/memory"
warn "Agent memory preserved (mountspace/workspace-agent/memory/) — delete manually to reset"

echo -e "\n${GREEN}Clean complete.${RESET} Run ${BOLD}./build.sh${RESET} to rebuild.\n"
