#!/bin/bash

source "$(dirname "$0")/docker_config.sh"

echo "Building image: $IMAGE_NAME..."
docker build -t "$IMAGE_NAME" .

VSCODE_SHADOW_DIR=$(mktemp -d)

echo "Starting container: $CONTAINER_NAME..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -v "$(pwd)":/mydockerspace \
    -v /dev/null:/mydockerspace/start.sh \
    -v /dev/null:/mydockerspace/stop.sh \
    -v "$VSCODE_SHADOW_DIR":/mydockerspace/.vscode \
    "$IMAGE_NAME" \
    tail -f /dev/null

echo "Copying SSH keys..."
docker cp ~/.ssh "$CONTAINER_NAME":/root/.ssh

echo "Copying VS Code settings..."
docker cp .vscode/settings.json "$CONTAINER_NAME":/mydockerspace/.vscode/settings.json

echo "Container started. To enter: docker exec -it $CONTAINER_NAME bash"

bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/permission.sh"
