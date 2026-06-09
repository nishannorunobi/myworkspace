#!/bin/bash
# start_daemon.sh — Start the workspace agent as a background daemon.
# The monitor runs silently; interact with the agent via the dashboard chat.
set -euo pipefail

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
[ -n "${ANTHROPIC_API_KEY:-}" ] || { echo -e "${RED}[ERROR]${RESET} ANTHROPIC_API_KEY not set in environment — run: export ANTHROPIC_API_KEY=..."; exit 1; }

if pgrep -f "workspace/agent.py --daemon" &>/dev/null; then
    echo -e "${GREEN}[  OK  ]${RESET} Workspace agent already running (PID $(pgrep -f "workspace/agent.py --daemon" | head -1))."
    exit 0
fi

LOG_FILE="$WORKSPACE_ROOT/mountspace/logs/workspace-agent/daemon.log"
mkdir -p "$(dirname "$LOG_FILE")"

export PYTHONPATH="$SCRIPT_DIR/workspace:$SCRIPT_DIR${PYTHONPATH:+:$PYTHONPATH}"
export LOG_FILE SCRIPT_DIR

nohup bash -c '"$SCRIPT_DIR/.venv/bin/python" -u "$SCRIPT_DIR/workspace/agent.py" --daemon 2>&1 | awk '"'"'{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }'"'"' >> "$LOG_FILE"' < /dev/null &

echo -e "${GREEN}[  OK  ]${RESET} Workspace agent daemon started (PID $(pgrep -f 'workspace/agent.py --daemon' | head -1))"
echo -e "         Log: $LOG_FILE"
