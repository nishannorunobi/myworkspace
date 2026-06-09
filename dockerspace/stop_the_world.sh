#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/stop_system_docker.sh"

echo "==> Shutting down the system..."
echo "${SUDO_PASS:-}" | sudo -S shutdown now 2>&1
