#!/bin/bash
# start_daemon.sh — Start the workspace agent as a background daemon.
# The monitor runs silently; interact with the agent via the dashboard chat.
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

RED="\033[31m"; GREEN="\033[32m"; RESET="\033[0m"

if [ ! -d ".venv" ]; then
    echo -e "\033[36m[INFO]\033[0m  .venv not found — running build.sh first..."
    bash "$SCRIPT_DIR/build.sh" || { echo -e "${RED}[ERROR]${RESET} build.sh failed."; exit 1; }
fi

[ -f "../shared.conf" ] || { echo -e "${RED}[ERROR]${RESET} ../shared.conf not found."; exit 1; }

source ../shared.conf

if pgrep -f "workspace/agent.py --daemon" &>/dev/null; then
    echo -e "${GREEN}[  OK  ]${RESET} Workspace agent already running (PID $(pgrep -f "workspace/agent.py --daemon" | head -1))."
    exit 0
fi

# Mirror log for the long-running agent.py daemon (bypasses this script's tee)
DAEMON_LOG="$WORKSPACE_ROOT/mountspace/logs/myworkspace/agents/workspace-agent/workspace/agent_py.log"
mkdir -p "$(dirname "$DAEMON_LOG")"

export PYTHONPATH="$SCRIPT_DIR/workspace:$SCRIPT_DIR${PYTHONPATH:+:$PYTHONPATH}"
export DAEMON_LOG SCRIPT_DIR

nohup bash -c '"$SCRIPT_DIR/.venv/bin/python" -u "$SCRIPT_DIR/workspace/agent.py" --daemon 2>&1 | awk '"'"'{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }'"'"' >> "$DAEMON_LOG"' < /dev/null &

echo -e "${GREEN}[  OK  ]${RESET} Workspace agent daemon started (PID $(pgrep -f 'workspace/agent.py --daemon' | head -1))"
echo -e "         Log: $DAEMON_LOG"
