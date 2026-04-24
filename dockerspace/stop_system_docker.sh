#!/bin/bash

echo "==> Stopping all running containers..."
RUNNING=$(docker ps -q)
if [ -n "$RUNNING" ]; then
    docker stop $RUNNING
    echo "    Done."
else
    echo "    No running containers."
fi

echo "==> Stopping Docker service..."
sudo systemctl stop docker

if ! systemctl is-active --quiet docker; then
    echo "    Docker is stopped."
else
    echo "    ERROR: Docker failed to stop."
    exit 1
fi
