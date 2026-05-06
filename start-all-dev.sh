#!/usr/bin/env bash
set -euo pipefail

# Dev-Variante von start-all.ps1 fuer den Devcontainer.
#
# Hinweise:
# - arangodb und minio laufen als services im selben docker-compose
#   Netzwerk (siehe .devcontainer/docker-compose.yml -> include
#   ../deployment/docker-compose.yml). Innerhalb des workspace-Containers
#   sind sie ueber die Service-Namen "arangodb" und "minio" erreichbar.
#   host.docker.internal wird daher nicht benoetigt.
# - BACKEND_URL / NEXT_PUBLIC_BACKEND_URL zeigen auf localhost:3333,
#   weil der Port auf den Host geforwarded wird und der Browser auf
#   dem Host laeuft. Server-side calls aus den Next.js Apps treffen
#   den Backend-Prozess im selben Container ebenfalls ueber localhost.

# Backend / Frontend URLs (vom Browser auf dem Host aufgerufen)
export BACKEND_URL="http://localhost:3333"
export NEXT_PUBLIC_BACKEND_URL="http://localhost:3333"

# ArangoDB (Compose-Service-Name)
export ARANGO_URL="http://arangodb:8529"
export ARANGO_DATABASE="track_planner"
export ARANGO_USER="root"
export ARANGO_PASSWORD="track_planner"

# MinIO (Compose-Service-Name)
export MINIO_ENDPOINT="minio"
export MINIO_PORT="9000"
export MINIO_USE_SSL="false"
export MINIO_ACCESS_KEY="minioadmin"
export MINIO_SECRET_KEY="minioadmin"
export MINIO_BUCKET_NAME="music-files"

# Nx Cache deaktivieren, damit Aenderungen sofort greifen
export NX_SKIP_NX_CACHE="true"

exec npm run dev:all
