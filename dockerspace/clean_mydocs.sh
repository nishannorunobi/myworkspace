#!/bin/bash
# clean_mydocs.sh — remove ALL mydocs (Plane) containers and their images.
# Leaves shared infra alone: Postgres/Redis are external services (not in the
# mydocs compose) and the compose networks are `external: true`, so neither is
# touched. Volumes are PRESERVED (uploaded files / MinIO data); pass --volumes
# to also drop them.
set -uo pipefail

# ── Mirror logging ─────────────────────────────────────────────────────────────
_WS_ROOT="$(d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; while [ ! -d "$d/mountspace" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done; echo "$d")"
if [ -f "$_WS_ROOT/init/create_logging_path.sh" ]; then
    source "$_WS_ROOT/init/create_logging_path.sh"
    setup_logging
fi
# ──────────────────────────────────────────────────────────────────────────────

MYDOCS_DIR="$_WS_ROOT/projectspace/mydocs"
COMPOSE_FILE="$MYDOCS_DIR/docker-compose.yml"

# Known mydocs images (fallback removal if compose can't resolve them).
MYDOCS_IMAGES=(
    "makeplane/plane-backend:stable"
    "makeplane/plane-frontend:stable"
    "makeplane/plane-admin:stable"
    "minio/minio"
    "nginx:alpine"
)

DROP_VOLUMES=0
[ "${1:-}" = "--volumes" ] && DROP_VOLUMES=1

echo "==> Cleaning mydocs (Plane) containers and images..."

# ── 1) Preferred path: compose down (containers + images, optionally volumes) ──
if [ -f "$COMPOSE_FILE" ]; then
    DOWN_ARGS=(down --rmi all --remove-orphans)
    [ "$DROP_VOLUMES" -eq 1 ] && DOWN_ARGS+=(--volumes)
    echo "==> docker compose ${DOWN_ARGS[*]}  (in $MYDOCS_DIR)"
    ( cd "$MYDOCS_DIR" && docker compose "${DOWN_ARGS[@]}" ) || \
        echo "    [warn] compose down reported errors — continuing with fallback cleanup."
else
    echo "    [warn] $COMPOSE_FILE not found — skipping compose down, using fallback."
fi

# ── 2) Fallback: force-remove any leftover plane-* containers ──────────────────
LEFTOVER=$(docker ps -aq --filter "name=^plane-" 2>/dev/null)
if [ -n "$LEFTOVER" ]; then
    echo "==> Removing leftover plane-* containers..."
    docker rm -f $LEFTOVER 2>/dev/null || true
fi

# ── 3) Fallback: remove known mydocs images still present ──────────────────────
echo "==> Removing mydocs images (skips any still in use by other containers)..."
for img in "${MYDOCS_IMAGES[@]}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
        docker rmi "$img" 2>/dev/null \
            && echo "    removed $img" \
            || echo "    [skip] $img (in use elsewhere or already gone)"
    fi
done

# ── Summary ────────────────────────────────────────────────────────────────────
echo "==> Done."
REMAIN=$(docker ps -aq --filter "name=^plane-" 2>/dev/null | wc -l | tr -d ' ')
echo "    plane-* containers remaining: $REMAIN"
[ "$DROP_VOLUMES" -eq 1 ] \
    && echo "    volumes: dropped (--volumes)" \
    || echo "    volumes: preserved (run with --volumes to drop MinIO data too)"
