#!/bin/bash
# docker_dashboard.sh — local Docker environment summary

# ─── Colors ───────────────────────────────────────────────────────────────────
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
BLUE="\033[0;34m"
RESET="\033[0m"

header() {
    echo ""
    echo -e "${BOLD}${BLUE}══════════════════════════════════════════${RESET}"
    echo -e "${BOLD}${BLUE}  $1${RESET}"
    echo -e "${BOLD}${BLUE}══════════════════════════════════════════${RESET}"
}

section() {
    echo ""
    echo -e "${BOLD}${CYAN}── $1 ──────────────────────────────────────${RESET}"
}

none() {
    echo -e "  ${DIM}(none)${RESET}"
}

# ─── Guard ────────────────────────────────────────────────────────────────────

if ! docker info &>/dev/null; then
    echo -e "${RED}ERROR: Docker daemon is not running.${RESET}"
    exit 1
fi

# ─── Header ───────────────────────────────────────────────────────────────────

header "Docker Dashboard  $(date '+%Y-%m-%d %H:%M:%S')"

# ─── Docker version ───────────────────────────────────────────────────────────

section "Docker Version"
docker_version=$(docker version --format 'Client: {{.Client.Version}}   Server: {{.Server.Version}}' 2>/dev/null)
echo -e "  ${docker_version}"

# ─── Disk usage ───────────────────────────────────────────────────────────────

section "Disk Usage"
docker system df 2>/dev/null | sed 's/^/  /'

# ─── Images ───────────────────────────────────────────────────────────────────

section "Images"
images=$(docker images --format "{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}" 2>/dev/null)
if [ -z "$images" ]; then
    none
else
    printf "  %-40s %-14s %-10s %s\n" "REPOSITORY:TAG" "IMAGE ID" "SIZE" "CREATED"
    echo "$images" | while IFS=$'\t' read -r repo id size created; do
        printf "  %-40s %-14s %-10s %s\n" "$repo" "$id" "$size" "$created"
    done
fi

# ─── Running containers ───────────────────────────────────────────────────────

section "Running Containers"
running=$(docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null)
if [ -z "$running" ]; then
    none
else
    printf "  %-30s %-30s %-20s %s\n" "NAME" "IMAGE" "STATUS" "PORTS"
    echo "$running" | while IFS=$'\t' read -r name image status ports; do
        printf "  ${GREEN}%-30s${RESET} %-30s %-20s %s\n" "$name" "$image" "$status" "$ports"
    done
fi

# ─── Stopped containers ───────────────────────────────────────────────────────

section "Stopped Containers"
stopped=$(docker ps -a --filter "status=exited" --filter "status=created" \
    --format "{{.Names}}\t{{.Image}}\t{{.Status}}" 2>/dev/null)
if [ -z "$stopped" ]; then
    none
else
    printf "  %-30s %-30s %s\n" "NAME" "IMAGE" "STATUS"
    echo "$stopped" | while IFS=$'\t' read -r name image status; do
        printf "  ${YELLOW}%-30s${RESET} %-30s %s\n" "$name" "$image" "$status"
    done
fi

# ─── Volumes ──────────────────────────────────────────────────────────────────

section "Volumes"
volumes=$(docker volume ls --format "{{.Name}}\t{{.Driver}}" 2>/dev/null)
if [ -z "$volumes" ]; then
    none
else
    printf "  %-40s %s\n" "NAME" "DRIVER"
    echo "$volumes" | while IFS=$'\t' read -r name driver; do
        printf "  %-40s %s\n" "$name" "$driver"
    done
fi

# ─── Networks ─────────────────────────────────────────────────────────────────

section "Networks (non-default)"
net_output=""
while IFS=$'\t' read -r name driver scope; do
    [[ "$name" == "bridge" || "$name" == "host" || "$name" == "none" ]] && continue
    net_output="${net_output}${name}\t${driver}\t${scope}\n"
done < <(docker network ls --format $'{{.Name}}\t{{.Driver}}\t{{.Scope}}' 2>/dev/null)

if [ -z "$net_output" ]; then
    none
else
    printf "  %-30s %-12s %s\n" "NAME" "DRIVER" "SCOPE"
    printf "%b" "$net_output" | while IFS=$'\t' read -r name driver scope; do
        printf "  %-30s %-12s %s\n" "$name" "$driver" "$scope"
    done
fi

# ─── Resource usage (running containers only) ─────────────────────────────────

running_count=$(docker ps -q 2>/dev/null | wc -l)
if [ "$running_count" -gt 0 ]; then
    section "Resource Usage (live)"
    docker stats --no-stream --format \
        "table  {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" \
        2>/dev/null
fi

# ─── Summary counts ───────────────────────────────────────────────────────────

section "Summary"
img_count=$(docker images -q 2>/dev/null | wc -l)
run_count=$(docker ps -q 2>/dev/null | wc -l)
stop_count=$(docker ps -a -q --filter "status=exited" 2>/dev/null | wc -l)
vol_count=$(docker volume ls -q 2>/dev/null | wc -l)
net_count=$(docker network ls -q 2>/dev/null | wc -l)

echo -e "  Images:              ${BOLD}${img_count}${RESET}"
echo -e "  Running containers:  ${BOLD}${GREEN}${run_count}${RESET}"
echo -e "  Stopped containers:  ${BOLD}${YELLOW}${stop_count}${RESET}"
echo -e "  Volumes:             ${BOLD}${vol_count}${RESET}"
echo -e "  Networks:            ${BOLD}${net_count}${RESET}"
echo ""
