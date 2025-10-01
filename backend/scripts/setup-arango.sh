#!/bin/bash

# Setup ArangoDB database and user for track-planner

echo "Setting up ArangoDB database..."

# Create database and user
curl -X POST \
  http://localhost:8529/_api/database \
  -H 'Content-Type: application/json' \
  -u root:track_planner \
  -d '{
    "name": "track-planner",
    "users": [
      {
        "username": "track-planner",
        "passwd": "track-planner",
        "active": true
      }
    ]
  }'

echo ""
echo "Database 'track-planner' created with user 'track-planner'"
echo ""

# Create music collection
curl -X POST \
  http://localhost:8529/_db/track-planner/_api/collection \
  -H 'Content-Type: application/json' \
  -u track-planner:track-planner \
  -d '{
    "name": "music",
    "type": 2
  }'

echo ""
echo "Collection 'music' created"
echo ""
echo "Setup complete!"
