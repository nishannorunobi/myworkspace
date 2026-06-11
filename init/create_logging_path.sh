#!/bin/bash
# create_logging_path.sh — Workspace-standard mirror log library.
#
# HOW TO USE IN ANY HOST SCRIPT:
# ──────────────────────────────
#   # Near the top of your script, after SCRIPT_DIR is set:
#   source "$(_ws_root="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"; echo "$_ws_root/init/create_logging_path.sh")"
#   setup_logging
#
# HOW TO USE IN CONTAINER SCRIPTS:
# ─────────────────────────────────
#   Add this block after set -euo pipefail (container sets LOG_MIRROR_ROOT + CONTAINER_WORKDIR):
#
#   _SELF_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
#   _BASE="$(basename "$_SELF_ABS")"; _EXT="${_BASE##*.}"; _STEM="${_BASE%.*}"
#   _REL_DIR="$(dirname "${_SELF_ABS#${CONTAINER_WORKDIR:-}/}")"
#   [ "$_REL_DIR" = "." ] && _REL_DIR="" || _REL_DIR="/$_REL_DIR"
#   LOG_FILE="${LOG_MIRROR_ROOT:-/tmp/logs}${_REL_DIR}/${_STEM}_${_EXT}.log"
#   mkdir -p "$(dirname "$LOG_FILE")" && export LOG_FILE
#   exec > >(awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' | tee -a "$LOG_FILE") 2>&1
#   echo "[logging] → $LOG_FILE"
#
# LOG PATH CONVENTION:
# ────────────────────
#   /workspace/myworkspace_struct.sh
#     → mountspace/logs/myworkspace/myworkspace_struct_sh.log
#
#   /workspace/agents/docker-manager-agent/dbagent/start-db-agent.sh
#     → mountspace/logs/myworkspace/agents/docker-manager-agent/dbagent/start-db-agent_sh.log
#
#   (container) /mypostgresql_db/db-agent/backup_db/backup_mydocs.sh
#     → mountspace/logs/myworkspace/projectspace/mypostgresql_db/db-agent/backup_db/backup_mydocs_sh.log
#
#   (container) /mypostgresql_db/db-agent/server.py
#     → mountspace/logs/myworkspace/projectspace/mypostgresql_db/db-agent/server_py.log

# ── Detect workspace root (walk up until we find mountspace/) ─────────────────
_find_workspace_root() {
    local dir="$1"
    while [ "$dir" != "/" ]; do
        [ -d "$dir/mountspace" ] && echo "$dir" && return 0
        dir="$(dirname "$dir")"
    done
    echo ""
}

# ── Compute mirror log path from an absolute script path ─────────────────────
# Args: $1 = absolute path to script
get_mirror_log_path() {
    local script_abs="$1"
    local ws_root
    ws_root="$(_find_workspace_root "$(dirname "$script_abs")")"

    if [ -z "$ws_root" ]; then
        # Fallback: no workspace root found
        local base; base="$(basename "$script_abs")"
        echo "/tmp/logs/${base%.*}_${base##*.}.log"
        return
    fi

    local ws_name; ws_name="$(basename "$ws_root")"

    # Relative path from workspace root
    local rel="${script_abs#$ws_root/}"
    # If outside workspace, just use basename
    [[ "$rel" = "$script_abs" ]] && rel="$(basename "$script_abs")"

    local dir filename stem ext
    dir="$(dirname "$rel")"
    filename="$(basename "$rel")"
    stem="${filename%.*}"
    ext="${filename##*.}"

    local log_name
    if [ "$stem" = "$filename" ]; then
        log_name="${stem}.log"
    else
        log_name="${stem}_${ext}.log"
    fi

    local log_dir
    if [ "$dir" = "." ]; then
        log_dir="$ws_root/mountspace/logs/$ws_name"
    else
        log_dir="$ws_root/mountspace/logs/$ws_name/$dir"
    fi

    echo "$log_dir/$log_name"
}

# ── Setup logging for the calling script ─────────────────────────────────────
# Call once near the top of your script, after set -euo pipefail.
# Sets and exports LOG_FILE, redirects stdout + stderr with timestamps.
setup_logging() {
    local script_abs
    script_abs="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)/$(basename "${BASH_SOURCE[1]}")"

    LOG_FILE="$(get_mirror_log_path "$script_abs")"
    mkdir -p "$(dirname "$LOG_FILE")"

    exec > >(awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' | tee -a "$LOG_FILE") 2>&1

    export LOG_FILE
    echo "[logging] → $LOG_FILE"
}
