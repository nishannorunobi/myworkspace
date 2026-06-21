#!/bin/bash
# docker_network.sh — create the shared workspace Docker network (idempotent).
# All project containers attach to this network so they can reach each other by name.
NAME=my_docker_network
SUBNET=172.28.0.0/16

if docker network inspect "$NAME" >/dev/null 2>&1; then
    echo "Network $NAME already exists."
else
    docker network create --subnet="$SUBNET" "$NAME"
    echo "Created network $NAME ($SUBNET)."
fi
