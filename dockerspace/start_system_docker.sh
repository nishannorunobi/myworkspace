#!/bin/bash

echo "==> Starting Docker service and socket..."
sudo systemctl start docker.socket docker.service

if systemctl is-active --quiet docker.service; then
    echo "    Docker is running."
else
    echo "    ERROR: Docker failed to start."
    exit 1
fi
