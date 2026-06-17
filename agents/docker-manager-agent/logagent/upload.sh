#!/bin/bash
# upload.sh — replicate the LOCAL log-agent source INTO the running container at
# runtime (no image rebuild). The container's source is baked in (not bind-mounted),
# so this is how a local fix reaches the running container during development.
# Excludes .venv (Linux/in-container built) and caches. After it finishes, click
# Start to restart the log-agent on the freshly uploaded code.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ── Mirror logging ─────────────────────────────────────────────────────────────
source "$WORKSPACE_ROOT/init/create_logging_path.sh"
setup_logging
# ──────────────────────────────────────────────────────────────────────────────

CONTAINER="mylog_analytics-container"
SRC="$WORKSPACE_ROOT/projectspace/mylog_analytics"
DEST="/mylog_analytics"          # CONTAINER_WORKDIR

if ! docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "[upload] ERROR: container $CONTAINER not found. Start the container first."; exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "[upload] ERROR: container $CONTAINER is not running. Start it first."; exit 1
fi

echo "[upload] replicating local source into $CONTAINER:$DEST"
echo "[upload]   from: $SRC"
echo "[upload]   excluding: .venv, __pycache__, .git, *.pyc, *.log"

# Stream a tar of the source (with excludes) straight into the container and extract.
# docker cp can't exclude, so tar | docker exec tar is used instead.
tar -C "$SRC" \
    --exclude='./log-agent/.venv' \
    --exclude='./.git' \
    --exclude='*/__pycache__' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='*.log' \
    -cf - . | docker exec -i "$CONTAINER" tar -xf - -C "$DEST"

echo "[upload] done — local source is now inside the container."
echo "[upload] click Start to restart the log-agent on the new code."
