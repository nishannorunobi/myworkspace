#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/workspace.conf"

RESOURCES_PATH="$WORKSPACE_ROOT/mountspace"

mkdir -p "$RESOURCES_PATH"
sudo chown -R "$USER":"$USER" "$RESOURCES_PATH"
echo "Permissions fixed for mountspace"
