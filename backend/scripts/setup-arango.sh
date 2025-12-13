#!/bin/bash

set -euo pipefail

ARANGO_URL=${ARANGO_URL:-http://localhost:8529}
ROOT_USER=${ARANGO_ROOT_USER:-root}
ROOT_PASS=${ARANGO_ROOT_PASSWORD:-track_planner}
DB_NAME=${ARANGO_DB_NAME:-track-planner}
APP_USER=${ARANGO_APP_USER:-track-planner}
APP_PASS=${ARANGO_APP_PASSWORD:-track-planner}
COLLECTION_NAME=${ARANGO_COLLECTION_NAME:-music}

echo "Setting up ArangoDB database..."

create_payload=$(cat <<EOF
{
  "name": "${DB_NAME}",
  "users": [
    {
      "username": "${APP_USER}",
      "passwd": "${APP_PASS}",
      "active": true
    }
  ]
}
EOF
)

tmp_response=$(mktemp)
status_code=$(
  curl -s -o "${tmp_response}" -w "%{http_code}" -X POST \
    "${ARANGO_URL}/_api/database" \
    -H 'Content-Type: application/json' \
    -u "${ROOT_USER}:${ROOT_PASS}" \
    -d "${create_payload}"
)

if [[ "${status_code}" == "201" ]]; then
  echo "Database '${DB_NAME}' created with user '${APP_USER}'"
elif [[ "${status_code}" == "409" ]]; then
  echo "Database '${DB_NAME}' already exists, skipping creation."
else
  echo "Failed to create database (status ${status_code}):"
  cat "${tmp_response}"
  rm -f "${tmp_response}"
  exit 1
fi
rm -f "${tmp_response}"

collection_payload=$(cat <<EOF
{
  "name": "${COLLECTION_NAME}",
  "type": 2
}
EOF
)

tmp_response=$(mktemp)
status_code=$(
  curl -s -o "${tmp_response}" -w "%{http_code}" -X POST \
    "${ARANGO_URL}/_db/${DB_NAME}/_api/collection" \
    -H 'Content-Type: application/json' \
    -u "${APP_USER}:${APP_PASS}" \
    -d "${collection_payload}"
)

if [[ "${status_code}" == "200" ]]; then
  echo "Collection '${COLLECTION_NAME}' created."
elif [[ "${status_code}" == "409" ]]; then
  echo "Collection '${COLLECTION_NAME}' already exists, skipping creation."
else
  echo "Failed to create collection (status ${status_code}):"
  cat "${tmp_response}"
  rm -f "${tmp_response}"
  exit 1
fi
rm -f "${tmp_response}"

playlist_payload=$(cat <<EOF
{
  "name": "playlists",
  "type": 2
}
EOF
)

tmp_response=$(mktemp)
status_code=$(
  curl -s -o "${tmp_response}" -w "%{http_code}" -X POST \
    "${ARANGO_URL}/_db/${DB_NAME}/_api/collection" \
    -H 'Content-Type: application/json' \
    -u "${APP_USER}:${APP_PASS}" \
    -d "${playlist_payload}"
)

if [[ "${status_code}" == "200" ]]; then
  echo "Collection 'playlists' created."
elif [[ "${status_code}" == "409" ]]; then
  echo "Collection 'playlists' already exists, skipping creation."
else
  echo "Failed to create 'playlists' collection (status ${status_code}):"
  cat "${tmp_response}"
  rm -f "${tmp_response}"
  exit 1
fi
rm -f "${tmp_response}"

echo "Setup complete!"