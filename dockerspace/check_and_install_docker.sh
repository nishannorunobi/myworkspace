#!/bin/bash
# check_and_install_docker.sh — checks if Docker is installed; installs it if missing.
# Reports daemon status but does NOT start or stop anything.
# Run manually whenever you need to verify or set up Docker.

# ─── Check / Install ───────────────────────────────────────────────────────────

if command -v docker &>/dev/null; then
    echo "==> Docker is installed: $(docker --version)"
else
    echo "==> Docker is NOT installed. Installing..."

    case "$(uname -s)" in
        Linux)
            if ! command -v curl &>/dev/null; then
                echo "    ERROR: 'curl' not found. Install it first: sudo apt-get install -y curl"
                exit 1
            fi
            curl -fsSL https://get.docker.com | sudo sh
            if ! id -nG "$USER" | grep -qw docker; then
                echo "==> Adding '$USER' to the 'docker' group..."
                sudo usermod -aG docker "$USER"
                echo "    NOTE: Log out and back in (or run 'newgrp docker') for group membership."
            fi
            ;;
        Darwin)
            if command -v brew &>/dev/null; then
                brew install --cask docker
            else
                echo "    ERROR: Homebrew not found. Install from https://brew.sh or Docker Desktop manually."
                exit 1
            fi
            ;;
        *)
            echo "    ERROR: Unsupported OS. Install Docker manually: https://docs.docker.com/get-docker/"
            exit 1
            ;;
    esac

    echo "==> Docker installed: $(docker --version)"
fi

# ─── Daemon status ─────────────────────────────────────────────────────────────

echo ""
if docker info &>/dev/null; then
    echo "==> Docker daemon is running."
    echo ""
    echo "--- Running containers ---"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
else
    echo "==> Docker daemon is NOT running."
    echo "    Start it with: bash dockerspace/start_system_docker.sh"
fi
