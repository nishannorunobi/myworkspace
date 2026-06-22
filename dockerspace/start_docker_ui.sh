#!/bin/bash

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

PORTAINER_CONTAINER="portainer"
PORTAINER_IMAGE="portainer/portainer-ce:latest"
PORTAINER_PORT="9001"   # 9000 is used by mydocs' plane-minio (S3 API); Portainer moved to 9001
# Host bind mount (not a named volume) so `docker volume prune` / clean routines
# can never wipe Portainer's embedded DB (/data/portainer.db) and force the admin
# setup prompt again. Survives all docker cleans because it lives in the workspace.
PORTAINER_DATA="$_WS_ROOT/mountspace/portainer-data"

if docker inspect -f '{{.State.Status}}' "$PORTAINER_CONTAINER" 2>/dev/null | grep -q "running"; then
    echo "==> Portainer is already running."
    echo "    UI: http://localhost:$PORTAINER_PORT"
    exit 0
fi

if docker container inspect "$PORTAINER_CONTAINER" &>/dev/null; then
    echo "==> Starting existing Portainer container..."
    docker start "$PORTAINER_CONTAINER"
else
    echo "==> Creating and starting Portainer..."
    mkdir -p "$PORTAINER_DATA"
    docker run -d \
        --name "$PORTAINER_CONTAINER" \
        --restart=unless-stopped \
        -p "$PORTAINER_PORT":9000 \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$PORTAINER_DATA":/data \
        "$PORTAINER_IMAGE"
fi

echo "    Done."
echo "    UI: http://localhost:$PORTAINER_PORT"
#admin user name pass:
#user: admin, pass: portaineradmin123
