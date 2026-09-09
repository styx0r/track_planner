# syntax=docker/dockerfile:1
#
# Generic image for the four static Next.js frontends
# (rehearsal, conductor, moderator, mixing-desk).
#
# Build context is the REPO ROOT. Select the app with --build-arg APP=<name>.
# The backend URL is baked into the static files at build time, so it is a
# build arg as well; changing it requires rebuilding the image.
#
#   docker build -f deployment/docker/frontend.Dockerfile \
#     --build-arg APP=conductor \
#     --build-arg NEXT_PUBLIC_BACKEND_URL=http://192.168.1.10:3333 \
#     -t track-planner-conductor .

# ---------------------------------------------------------------------------
# Stage 1: install the monorepo and run `nx build` for the selected app.
# The first COPY/RUN block is byte-identical to backend/Dockerfile and
# backoffice.Dockerfile so BuildKit shares the (large) npm ci layer.
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

ARG APP
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:3333
# Only used by conductor (unlock PIN); harmless for the others.
ARG NEXT_PUBLIC_CONDUCTOR_PIN=1234

ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL} \
    NEXT_PUBLIC_CONDUCTOR_PIN=${NEXT_PUBLIC_CONDUCTOR_PIN} \
    NEXT_TELEMETRY_DISABLED=1

COPY ${APP} ./${APP}

RUN test -n "${APP}" || (echo "APP build arg is required" && exit 1) \
 && npx nx build @track-planner/${APP} \
 && mv /repo/${APP}/out /out

# ---------------------------------------------------------------------------
# Stage 2: nginx serving the export
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY deployment/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out /usr/share/nginx/html

EXPOSE 80
