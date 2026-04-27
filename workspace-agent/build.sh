#!/bin/bash
# build.sh — Set up venv and install dependencies (runs locally, no Docker).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; RED="\033[31m"; RESET="\033[0m"

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[ OK ]${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
fail()    { echo -e "${RED}[FAIL]${RESET}  $*" >&2; exit 1; }

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Workspace Management Agent — Build     ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}\n"

command -v python3 &>/dev/null || fail "python3 not found."
info "Python $(python3 --version 2>&1 | awk '{print $2}') found"

if [ ! -d ".venv" ]; then
    info "Creating virtual environment..."
    python3 -m venv .venv
    success "Virtual environment created"
else
    info "Virtual environment exists — skipping"
fi

info "Installing dependencies..."
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q
success "Dependencies installed"

if [ ! -f "agent.conf" ]; then
    cp agent.conf.example agent.conf
    warn "agent.conf created — set ANTHROPIC_API_KEY in agent.conf"
else
    success "agent.conf exists"
fi

mkdir -p memory
success "memory/ directory ready"

echo -e "\n${GREEN}Build complete.${RESET}"
echo -e "  Run   : ${BOLD}./start.sh${RESET}"
echo -e "  Check : ${BOLD}./health.sh${RESET}\n"
