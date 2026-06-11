#!/bin/bash

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

echo "==> Stopping all running containers..."
RUNNING=$(docker ps -q)
if [ -n "$RUNNING" ]; then
    docker stop $RUNNING
    echo "    Done."
else
    echo "    No running containers."
fi

echo "==> Stopping Docker service and socket..."
echo "${SUDO_PASS:-}" | sudo -S systemctl stop docker.service docker.socket 2>&1

if ! systemctl is-active --quiet docker.service && ! systemctl is-active --quiet docker.socket; then
    echo "    Docker is fully stopped."
else
    echo "    ERROR: Docker failed to stop completely."
    exit 1
fi
