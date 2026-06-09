#!/bin/bash

echo "==> Starting Docker service and socket..."
echo "${SUDO_PASS:-}" | sudo -S systemctl start docker.socket docker.service 2>&1

if systemctl is-active --quiet docker.service; then
    echo "    Docker is running."
else
    echo "    ERROR: Docker failed to start."
    exit 1
fi
