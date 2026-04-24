#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/stop_system_docker.sh"

echo "==> Shutting down the system..."
sudo shutdown now
