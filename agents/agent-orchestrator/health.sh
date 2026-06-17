#!/bin/bash
# health.sh — Check dashboard agent is ready to run.
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

GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; BOLD="\033[1m"; DIM="\033[2m"; RESET="\033[0m"

pass() { echo -e "${GREEN}[  OK  ]${RESET} $*"; }
fail() { echo -e "${RED}[ FAIL ]${RESET} $*"; OVERALL=1; }
warn() { echo -e "${YELLOW}[ WARN ]${RESET} $*"; }
info() { echo -e "         ${DIM}$*${RESET}"; }

OVERALL=0

echo -e "\n${BOLD}Dashboard Agent — Health Check${RESET}\n"

command -v python3 &>/dev/null \
    && pass "Python $(python3 --version 2>&1 | awk '{print $2}')" \
    || fail "python3 not found"

[ -d ".venv" ] && pass ".venv exists" || fail ".venv missing — run ./build.sh"

if [ -d ".venv" ]; then
    MISSING=""
    for pkg in anthropic dotenv fastapi uvicorn; do
        .venv/bin/python -c "import $pkg" 2>/dev/null || MISSING="$MISSING $pkg"
    done
    [ -z "$MISSING" ] && pass "Dependencies installed" || fail "Missing:$MISSING — run ./build.sh"
fi

[ -f "../shared.conf" ] && pass "shared.conf exists" || fail "shared.conf not found at agents/shared.conf"

if [ -d "static" ] && [ -f "static/index.html" ]; then
    pass "static/ assets present"
else
    fail "static/index.html missing"
fi

[ -f "server.conf" ] && pass "server.conf exists" || fail "server.conf not found"

source server.conf 2>/dev/null || true
PORT="${PORT:-8888}"
LOG_DIR="$WORKSPACE_ROOT/mountspace/logs/myworkspace/agents/agent-orchestrator"
LOG_FILE="$LOG_DIR/server_py.log"

if ss -tlnp 2>/dev/null | grep -q ":${PORT}"; then
    pass "Dashboard agent is running (port ${PORT})"
else
    warn "Dashboard agent is not running — run ./start_web.sh"
fi

mkdir -p "$LOG_DIR"
[ -f "$LOG_FILE" ] || touch "$LOG_FILE"   # create if missing, never overwrite existing
LINES=$(wc -l < "$LOG_FILE")
pass "Log file: $LOG_FILE ($LINES lines)"

echo ""
echo "──────────────────────────────────────────"
if [ "$OVERALL" -eq 0 ]; then
    echo -e "Status: ${GREEN}HEALTHY${RESET} — run ./start_web.sh to begin"
else
    echo -e "Status: ${RED}UNHEALTHY${RESET} — fix the issues above"
fi
echo ""
exit $OVERALL
