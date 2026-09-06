# syntax=docker/dockerfile:1
#
# Track Planner backend (NestJS) image.
#
# Build context is the REPO ROOT, not backend/, because the Nx build needs the
# root package.json / lockfile / nx.json:
#
#   docker build -f backend/Dockerfile -t track-planner-backend .
#
# Normally you don't call this directly; deployment/docker-compose.backend.yml does.

# ---------------------------------------------------------------------------
# Stage 1: build backend/dist with Nx + webpack
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build

ENV NX_DAEMON=false \
    NX_SKIP_NX_CACHE=true \
    CI=true

WORKDIR /repo

# npm workspaces: every workspace package.json must be present for `npm ci`
# to match the lockfile, even though we only build the backend.
COPY package.json package-lock.json nx.json tsconfig.base.json tsconfig.json ./
COPY backend/package.json ./backend/
COPY backend-e2e/package.json ./backend-e2e/
COPY rehearsal/package.json ./rehearsal/
COPY conductor/package.json ./conductor/
COPY moderator/package.json ./moderator/
COPY mixing-desk/package.json ./mixing-desk/
COPY backoffice/package.json ./backoffice/
COPY shared-ui/package.json ./shared-ui/

RUN npm ci

COPY backend ./backend

# Produces backend/dist/{main.js,package.json,package-lock.json,assets}
RUN npx nx build @track-planner/backend

# ---------------------------------------------------------------------------
# Stage 2: slim runtime with only production deps + audio tooling
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

# ffmpeg  -> server-side waveform generation on upload (music.service.ts)
# ffplay  -> comes with ffmpeg, used for server-side audio playback
# mpv     -> preferred audio player (playback.service.ts tries mpv first)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg mpv ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && usermod -aG audio node

WORKDIR /app

# Install only the pruned production dependency set that the Nx build generated.
# `npm install` rather than `npm ci`: the lockfile Nx prunes for dist/ is
# missing a handful of nested transitive entries (negotiator, encodeurl, ms),
# so a strict `npm ci` refuses to run. package.json pins exact versions anyway.
COPY --from=build /repo/backend/dist/package.json /repo/backend/dist/package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /repo/backend/dist ./

# The GraphQL schema is auto-written to <cwd>/src/schema.gql on startup.
RUN mkdir -p /app/src && chown -R node:node /app

USER node

ENV NODE_ENV=production \
    PORT=3333

EXPOSE 3333

CMD ["node", "main.js"]
