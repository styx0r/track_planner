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

# Conductor unlock PIN (baked into the conductor build)
export NEXT_PUBLIC_CONDUCTOR_PIN="1234"

# ArangoDB (Compose-Service-Name)
export ARANGO_URL="http://arangodb:8529"
export ARANGO_ROOT_USER="root"
export ARANGO_ROOT_PASSWORD="track_planner"
export ARANGO_DATABASE="track-planner"
export ARANGO_USER="track-planner"
export ARANGO_PASSWORD="track-planner"

# MinIO (Compose-Service-Name)
export MINIO_ENDPOINT="minio"
export MINIO_PORT="9000"
export MINIO_USE_SSL="false"
export MINIO_REGION="eu-central-1"
export MINIO_PUBLIC_ENDPOINT="localhost"
export MINIO_PUBLIC_PORT="9000"
export MINIO_PUBLIC_USE_SSL="false"
export MINIO_ACCESS_KEY="minioadmin"
export MINIO_SECRET_KEY="minioadmin"
export MINIO_BUCKET_NAME="music-files"

# Nx Cache deaktivieren, damit Aenderungen sofort greifen
export NX_SKIP_NX_CACHE="true"

echo "Waiting for ArangoDB at ${ARANGO_URL}..."
for attempt in {1..30}; do
  if curl -fsS -u "${ARANGO_ROOT_USER}:${ARANGO_ROOT_PASSWORD}" "${ARANGO_URL}/_api/version" >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" == "30" ]]; then
    echo "ArangoDB did not become reachable at ${ARANGO_URL}."
    exit 1
  fi
  sleep 1
done

ARANGO_DB_NAME="${ARANGO_DATABASE}" \
ARANGO_APP_USER="${ARANGO_USER}" \
ARANGO_APP_PASSWORD="${ARANGO_PASSWORD}" \
bash backend/scripts/setup-arango.sh

exec npm run dev:all
