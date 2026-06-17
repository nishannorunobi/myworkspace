#!/bin/bash
# clean_all_git_projects.sh — Force-remove ALL projects from projectspace/.
# Wipes every entry inside projectspace/ (the projectspace/ folder itself is kept).
# This is destructive and irreversible — uncommitted/unpushed changes are lost.
# Run on the HOST from anywhere.
# Usage:
#   bash init/clean_all_git_projects.sh        # prompts for confirmation
#   bash init/clean_all_git_projects.sh -y      # skip prompt (force)
set -euo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECTSPACE="$WORKSPACE_ROOT/projectspace"

BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"
YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"

ok()   { echo -e "${GREEN}[ OK ]${RESET}  $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
err()  { echo -e "${RED}[FAIL]${RESET}  $*"; }

FORCE=false
[ "${1:-}" = "-y" ] || [ "${1:-}" = "--force" ] && FORCE=true

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     Clean ALL Projects (DESTRUCTIVE)     ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
info "Projectspace: $PROJECTSPACE"

# ── Safety guards — never run rm -rf on an empty/unexpected path ────────────────
case "$PROJECTSPACE" in
    "" | "/" ) err "Refusing to operate on unsafe path: '$PROJECTSPACE'"; exit 1 ;;
esac
if [ "${PROJECTSPACE#"$WORKSPACE_ROOT"/}" = "$PROJECTSPACE" ]; then
    err "projectspace must live inside the workspace root — refusing."; exit 1
fi
if [ ! -d "$PROJECTSPACE" ]; then
    warn "projectspace/ does not exist — nothing to clean."; exit 0
fi

# ── Collect entries to remove (all direct children of projectspace/) ───────────
shopt -s nullglob dotglob
ENTRIES=("$PROJECTSPACE"/*)
shopt -u nullglob dotglob

if [ ${#ENTRIES[@]} -eq 0 ]; then
    ok "projectspace/ is already empty — nothing to do."
    echo ""
    exit 0
fi

echo ""
warn "The following ${#ENTRIES[@]} item(s) will be FORCE-REMOVED (rm -rf):"
for e in "${ENTRIES[@]}"; do
    echo -e "   ${RED}✗${RESET} ${e#"$WORKSPACE_ROOT"/}"
done
echo ""

# ── Confirmation (UI pre-fills 'yes' on stdin; -y skips entirely) ──────────────
if [ "$FORCE" != true ]; then
    warn "This is irreversible. Uncommitted or unpushed work will be lost."
    # Prompt via echo (newline-terminated) so the line-buffered awk in setup_logging
    # flushes it in order; a newline-less `read -p` prompt buffers forever and the
    # script looks stuck in the terminal. stdin still answers both ways: keyboard
    # in the terminal, or the "yes" the UI pipes in.
    echo "Type 'yes' to remove all of the above: "
    read -r ANSWER || ANSWER=""
    if [ "$ANSWER" != "yes" ]; then
        info "Aborted — nothing was removed."
        echo ""
        exit 0
    fi
fi

# ── Remove ─────────────────────────────────────────────────────────────────────
# Plain rm first; if it fails (e.g. root-owned files created by Docker), retry
# with sudo. The UI prompts for the sudo password and passes it as SUDO_PASS.
_rm() {
    local target="$1"
    rm -rf "$target" 2>/dev/null && return 0
    if [ -n "${SUDO_PASS:-}" ]; then
        info "Permission denied — retrying '$NAME' with sudo..."
        echo "${SUDO_PASS}" | sudo -S rm -rf "$target" 2>&1 && return 0
    elif command -v sudo >/dev/null 2>&1; then
        info "Permission denied — retrying '$NAME' with sudo..."
        sudo rm -rf "$target" 2>&1 && return 0
    fi
    return 1
}

REMOVED=0
FAILED=0
for e in "${ENTRIES[@]}"; do
    NAME="${e#"$PROJECTSPACE"/}"
    if _rm "$e"; then
        ok "Removed $NAME"
        REMOVED=$((REMOVED + 1))
    else
        err "Failed to remove $NAME (try again — sudo password may be required)"
        FAILED=$((FAILED + 1))
    fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}─────────────────────────────────────────${RESET}"
[ $REMOVED -gt 0 ] && ok  "$REMOVED item(s) removed."
[ $FAILED  -gt 0 ] && err "$FAILED item(s) failed."
echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All projects cleared.${RESET} ${BOLD}$PROJECTSPACE${RESET} is now empty."
    echo -e "Re-clone with: ${BOLD}bash init/git_clone_projects.sh${RESET}"
else
    echo -e "${YELLOW}Done with errors.${RESET} Some items could not be removed (check permissions)."
fi
echo ""
