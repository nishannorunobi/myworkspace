#!/bin/bash
set -euo pipefail
# Dev environment setup — runs INSIDE the container. Safe to run multiple times.

source "$(dirname "${BASH_SOURCE[0]}")/functions.sh"

USER="devuser"

echo "====== Dev Container Setup ======"
install_packages
echo ""
echo "──── Setting up $USER ────"
setup_user            "$USER"
if [ "$COPY_SSH_FROM_HOST" = true ]; then
    copy_ssh_from_host "$USER"
else
    generate_ssh_key   "$USER"
fi
setup_git             "$USER"
setup_workspace_group    "$USER"
setup_docker_plugins     "$USER"
setup_vscode_extensions  root
setup_vscode_extensions  "$USER"

echo ""
echo "──── Cloning project ────"
setup_project "$USER"

echo ""
echo "Dev environment ready. Switch to: su - $USER"
