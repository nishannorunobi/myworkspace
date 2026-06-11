#!/bin/bash
# install_vscode.sh — Install Visual Studio Code on Ubuntu/Debian via Microsoft's apt repository.
set -euo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"
ok()   { echo -e "${GREEN}[ OK ]${RESET}  $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
err()  { echo -e "${RED}[ERROR]${RESET} $*"; }

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Install Visual Studio Code             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}\n"

# Already installed?
if command -v code &>/dev/null; then
    ok "VS Code already installed: $(code --version | head -1)"
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
apt-get install -y --no-install-recommends wget gpg apt-transport-https ca-certificates
ok "Dependencies installed."

# Microsoft GPG key
info "Adding Microsoft GPG key..."
wget -qO- https://packages.microsoft.com/keys/microsoft.asc \
    | gpg --dearmor > /usr/share/keyrings/microsoft-archive-keyring.gpg
ok "GPG key added."

# VS Code apt repository
info "Adding VS Code repository..."
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/microsoft-archive-keyring.gpg] \
https://packages.microsoft.com/repos/code stable main" \
    > /etc/apt/sources.list.d/vscode.list
ok "Repository added."

# Install
info "Installing VS Code..."
apt-get update -qq
apt-get install -y code
ok "VS Code installed: $(code --version | head -1)"

echo -e "\n${GREEN}Done.${RESET} Launch with: ${BOLD}code${RESET}\n"
