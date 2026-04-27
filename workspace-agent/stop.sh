#!/bin/bash
# stop.sh — Stop a running workspace-agent process.
set -euo pipefail

GREEN="\033[32m"; YELLOW="\033[33m"; RESET="\033[0m"

if pkill -f "agent.py" 2>/dev/null; then
    echo -e "${GREEN}[ OK ]${RESET}  Workspace agent stopped."
else
    echo -e "${YELLOW}[WARN]${RESET}  No running workspace agent found."
fi
