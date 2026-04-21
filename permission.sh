#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/docker_config.sh"

sudo chown -R "$USER":"$USER" "$SCRIPT_DIR/git-ignore-resources"

echo "Permissions fixed for git-ignore-resources"
