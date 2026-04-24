#!/bin/bash

echo "==> Starting Docker service..."
sudo systemctl start docker

if systemctl is-active --quiet docker; then
    echo "    Docker is running."
else
    echo "    ERROR: Docker failed to start."
    exit 1
fi
