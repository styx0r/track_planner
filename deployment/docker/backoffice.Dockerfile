# syntax=docker/dockerfile:1
#
# Backoffice (Next.js server with API routes that proxy to the backend).
# Unlike the static frontends, the backend URL is read at RUNTIME from the
# BACKEND_URL env var, so one image works for any deployment.
#
# Build context is the REPO ROOT:
#   docker build -f deployment/docker/backoffice.Dockerfile -t track-planner-backoffice .

# ---------------------------------------------------------------------------
# Stage 1: build with Next.js standalone output (see backoffice/next.config.js)
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build

ENV NX_DAEMON=false \
    NX_SKIP_NX_CACHE=true \
    CI=true

WORKDIR /repo

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

ENV NEXT_OUTPUT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1

COPY backoffice ./backoffice

RUN npx nx build @track-planner/backoffice

# ---------------------------------------------------------------------------
# Stage 2: minimal runtime with the traced standalone bundle
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# standalone/ mirrors the repo layout because outputFileTracingRoot is the
# workspace root: /app/backoffice/server.js + /app/node_modules
COPY --from=build --chown=node:node /repo/backoffice/.next/standalone ./
COPY --from=build --chown=node:node /repo/backoffice/.next/static ./backoffice/.next/static
COPY --from=build --chown=node:node /repo/backoffice/public ./backoffice/public

USER node

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BACKEND_URL=http://backend:3333

EXPOSE 3000

CMD ["node", "backoffice/server.js"]
