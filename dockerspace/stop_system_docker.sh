#!/bin/bash

echo "==> Stopping all running containers..."
RUNNING=$(docker ps -q)
if [ -n "$RUNNING" ]; then
    docker stop $RUNNING
    echo "    Done."
else
    echo "    No running containers."
fi

echo "==> Stopping Docker service and socket..."
sudo systemctl stop docker.service docker.socket

if ! systemctl is-active --quiet docker.service && ! systemctl is-active --quiet docker.socket; then
    echo "    Docker is fully stopped."
else
    echo "    ERROR: Docker failed to stop completely."
    exit 1
fi
