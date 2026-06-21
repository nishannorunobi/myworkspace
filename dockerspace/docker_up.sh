#!/bin/bash

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

echo "==> Checking Docker status..."

if systemctl is-active --quiet docker.service; then
    echo "    Docker is already running."
else
    echo "==> Starting Docker service..."
    echo "${SUDO_PASS:-}" | sudo -S systemctl start docker.socket docker.service 2>&1 || {
        echo "    ERROR: Failed to start Docker. Wrong password, or run manually:"
        echo "    sudo systemctl start docker.socket docker.service"
        exit 1
    }

    echo -n "    Waiting for Docker to be ready"
    for i in $(seq 1 10); do
        if systemctl is-active --quiet docker.service && docker info &>/dev/null; then
            echo " ready."
            break
        fi
        echo -n "."
        sleep 1
    done

    if ! systemctl is-active --quiet docker.service; then
        echo ""
        echo "    ERROR: Docker failed to start."
        systemctl status docker.service --no-pager
        exit 1
    fi
fi

echo ""
docker version

echo ""
echo "==> Ensuring shared docker network..."
bash "$(dirname "$0")/docker_network.sh"

echo ""
echo "==> Docker is up. You can now run your other scripts."
