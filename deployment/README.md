# Deployment

One `docker-compose.yml` runs any subset of the Track Planner stack. Pick the
services a machine should run via Compose profiles.

| Service | Profile(s) | Port | Notes |
|---------|------------|------|-------|
| `arangodb` | always | 8529 | Database. Named volume `arangodb_data`. |
| `minio` | always | 9000 | Audio / sheet-music storage. Named volume `minio_data`. |
| `arango-init` | always | – | One-shot: creates DB, user, collections. Idempotent. |
| `backend` | `backend`, `all` | 3333 | NestJS. `backend/Dockerfile`. |
| `rehearsal` | `rehearsal`, `frontends`, `all` | 3001 | Static export behind nginx. |
| `conductor` | `conductor`, `frontends`, `all` | 3002 | Static export behind nginx. PIN baked in. |
| `moderator` | `moderator`, `frontends`, `all` | 3003 | Static export behind nginx. |
| `mixing-desk` | `mixing-desk`, `frontends`, `all` | 3004 | Static export behind nginx. |
| `backoffice` | `backoffice`, `frontends`, `all` | 3000 | Next.js server, proxies `/api/*` to the backend at runtime. |

Files:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | The whole stack. Also `include`d by the devcontainer (no profile active there, so only infra starts). |
| `.env.example` | Template for `.env`: `PUBLIC_HOST`, `COMPOSE_PROFILES`, ports, credentials. |
| `arango-init.js` | arangosh bootstrap script run by `arango-init`. |
| `docker/frontend.Dockerfile` | Generic image for the four static frontends (`--build-arg APP=…`). |
| `docker/backoffice.Dockerfile` | Backoffice image using Next.js standalone output. |
| `docker/nginx.conf` | Clean-URL config for the static exports. |
| `../backend/Dockerfile` | Backend image (Nx build, slim runtime with `ffmpeg`/`mpv`). |

## Fresh machine, everything on it

```bash
git clone <repo> track_planner
cd track_planner/deployment
cp .env.example .env          # set PUBLIC_HOST to this machine's LAN IP
docker compose up -d --build  # .env has COMPOSE_PROFILES=all
docker compose ps
```

Requires Docker Compose v2.20+. The first build installs the monorepo's
`node_modules` once (shared layer) and then runs six Nx builds; expect
10 minutes or more. Later `--build` runs reuse the cached layers.

Afterwards, on any device in the LAN:

| App | URL |
|-----|-----|
| Backoffice | `http://<PUBLIC_HOST>:3000` |
| Rehearsal | `http://<PUBLIC_HOST>:3001` |
| Conductor | `http://<PUBLIC_HOST>:3002` |
| Moderator | `http://<PUBLIC_HOST>:3003` |
| Mixing Desk | `http://<PUBLIC_HOST>:3004` |
| Backend API / GraphQL | `http://<PUBLIC_HOST>:3333/api`, `/graphql` |
| ArangoDB UI | `http://<PUBLIC_HOST>:8529` |

## Selecting services

Three equivalent ways:

```bash
# 1. Default set in .env
COMPOSE_PROFILES=backend,conductor

# 2. Flags on the command line
docker compose --profile backend --profile conductor up -d --build

# 3. Naming services enables their profiles automatically
docker compose up -d --build backend conductor
```

Typical splits:

- **NAS with data only:** `COMPOSE_PROFILES=backend` – backend + ArangoDB + MinIO, no sound.
- **Everything on one box (rehearsal room PC):** `COMPOSE_PROFILES=all`.
- **Frontends on a second machine:** `COMPOSE_PROFILES=frontends`, `PUBLIC_HOST` = the backend machine's IP, and `BACKOFFICE_BACKEND_URL=http://<backend-ip>:3333`. ArangoDB/MinIO still start there but sit idle.

## Updating after a code change

```bash
git pull
docker compose up -d --build            # rebuilds changed images, restarts only those
```

## Things to know

- **`PUBLIC_HOST` is baked into the frontends.** The static apps get
  `NEXT_PUBLIC_BACKEND_URL=http://<PUBLIC_HOST>:<BACKEND_PORT>` at build time.
  Change the host or port → `docker compose up -d --build` to rebuild them.
- **MinIO links are signed for `PUBLIC_HOST`.** If clients cannot reach
  `PUBLIC_HOST:9000`, audio and sheet downloads fail with a signature error.
- **Sound.** The backend plays audio itself via `mpv`/`ffplay`. In a container
  there is normally no sound device, so playback is simulated (timers and
  positions still broadcast, nothing audible). See the commented
  `devices`/`group_add` block on the `backend` service to pass through ALSA
  on a Linux host with a sound card.
- **Backoffice → backend.** The backoffice container talks to the backend via
  `BACKEND_URL`, default `http://backend:3333` inside the compose network.
  Override with `BACKOFFICE_BACKEND_URL` when the backend runs elsewhere.
- **CPU temperature widget** expects a LibreHardwareMonitor endpoint and is
  Windows-specific; leave `CPU_TEMP_URL` unset in containers.
- **Windows production (`prod-all.ps1`)** keeps working unchanged: it runs
  `docker compose` in this folder without a `.env`, so only infra starts and
  the apps run natively as before.
