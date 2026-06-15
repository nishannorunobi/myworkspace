#!/bin/bash
# git_clone_projects.sh — Clone all workspace projects into projectspace/.
# Run on the HOST from the workspace root (or anywhere).
# Usage:
#   bash init/git_clone_projects.sh           # clone all missing projects
#   bash init/git_clone_projects.sh --pull    # also pull existing repos
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
warn() { echo -e "${YELLOW}[SKIP]${RESET}  $*"; }
err()  { echo -e "${RED}[FAIL]${RESET}  $*"; }

PULL_EXISTING=false
[ "${1:-}" = "--pull" ] && PULL_EXISTING=true

mkdir -p "$PROJECTSPACE"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║        Clone Workspace Projects          ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
info "Projectspace: $PROJECTSPACE"
echo ""

# ── Project list ──────────────────────────────────────────────────────────────
# Format: "folder_name|git_remote_url"
PROJECTS=(
    "mycache|git@github.com:nishannorunobi/mycache.git"
    "mychannels|git@github.com:nishannorunobi/mychannels.git"
    "mydocs|git@github.com:nishannorunobi/mydocs.git"
    "mylog_analytics|git@github.com:nishannorunobi/mylog_analytics.git"
    "mypostgresql_db|git@github.com:nishannorunobi/mypostgresql_db.git"
    "myodoo|git@github.com:nishannorunobi/myodoo.git"
)
CLONED=0
PULLED=0
SKIPPED=0
FAILED=0

for entry in "${PROJECTS[@]}"; do
    FOLDER="${entry%%|*}"
    REMOTE="${entry##*|}"
    DEST="$PROJECTSPACE/$FOLDER"

    if [ -d "$DEST/.git" ]; then
        if [ "$PULL_EXISTING" = true ]; then
            info "Pulling $FOLDER..."
            if git -C "$DEST" pull --ff-only 2>&1; then
                ok "$FOLDER pulled."
                PULLED=$((PULLED + 1))
            else
                err "$FOLDER pull failed — check for local changes."
                FAILED=$((FAILED + 1))
            fi
        else
            warn "$FOLDER already exists — skipping (use --pull to update)"
            SKIPPED=$((SKIPPED + 1))
        fi
    else
        info "Cloning $FOLDER from $REMOTE..."
        if git clone "$REMOTE" "$DEST" 2>&1; then
            ok "$FOLDER cloned."
            CLONED=$((CLONED + 1))
        else
            err "$FOLDER clone failed."
            FAILED=$((FAILED + 1))
        fi
    fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}─────────────────────────────────────────${RESET}"
[ $CLONED  -gt 0 ] && ok  "$CLONED project(s) cloned."
[ $PULLED  -gt 0 ] && ok  "$PULLED project(s) pulled."
[ $SKIPPED -gt 0 ] && warn "$SKIPPED project(s) already present (skipped)."
[ $FAILED  -gt 0 ] && err  "$FAILED project(s) failed."
echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All done.${RESET} Projects are in: ${BOLD}$PROJECTSPACE${RESET}"
else
    echo -e "${YELLOW}Done with errors.${RESET} Check SSH key / network and retry failed projects."
fi
echo ""
