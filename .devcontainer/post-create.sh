#!/bin/bash
set -e

echo "==> [post-create] Installing system dependencies for sharp/mupdf, waveform generation, and audio playback..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  build-essential \
  python3 \
  libvips-dev \
  ffmpeg \
  mpv \
  pkg-config \
  || true

echo "==> [post-create] Installing project dependencies (npm install)..."
cd /workspaces/track_planner
npm install --no-audit --no-fund

echo "==> [post-create] DONE."
