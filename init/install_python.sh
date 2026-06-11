#!/bin/bash
# install_python.sh — Install Python 3.12 on Ubuntu/Debian via deadsnakes PPA.
set -euo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

PYTHON_VERSION="3.12"

BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"
ok()   { echo -e "${GREEN}[ OK ]${RESET}  $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
err()  { echo -e "${RED}[ERROR]${RESET} $*"; }

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Install Python ${PYTHON_VERSION}                   ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}\n"

# Already installed?
if command -v python${PYTHON_VERSION} &>/dev/null; then
    ok "Python ${PYTHON_VERSION} already installed: $(python${PYTHON_VERSION} --version)"
    exit 0
fi

# Root check
if [ "$EUID" -ne 0 ]; then
    err "Please run as root: sudo bash $0"
    exit 1
fi

# Dependencies
info "Installing dependencies..."
apt-get update -qq
apt-get install -y --no-install-recommends software-properties-common
ok "Dependencies installed."

# Deadsnakes PPA
info "Adding deadsnakes PPA..."
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -qq
ok "PPA added."

# Install Python + extras
info "Installing Python ${PYTHON_VERSION}..."
apt-get install -y \
    python${PYTHON_VERSION} \
    python${PYTHON_VERSION}-venv \
    python${PYTHON_VERSION}-dev \
    python3-pip
ok "Python ${PYTHON_VERSION} installed: $(python${PYTHON_VERSION} --version)"

# Set as default python3
info "Setting python3 → python${PYTHON_VERSION}..."
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python${PYTHON_VERSION} 1
ok "Default python3 → $(python3 --version)"

echo -e "\n${GREEN}Done.${RESET} Run: ${BOLD}python${PYTHON_VERSION} --version${RESET}\n"
