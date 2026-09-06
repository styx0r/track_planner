# Deployment

| File | Purpose |
|------|---------|
| `docker-compose.yml` | ArangoDB + MinIO only. Used by the devcontainer and by `prod-all.ps1` (backend runs natively there). |
| `docker-compose.backend.yml` | Everything above **plus** the NestJS backend as a container. For a NAS or any headless Linux box. |
| `arango-init.js` | Idempotent DB bootstrap (database, user, collections), run once per `up` by the `arango-init` service. |
| `.env.example` | Template for `.env` (ports, credentials, `PUBLIC_HOST`). |
| `../backend/Dockerfile` | Multi-stage image build: Nx/webpack build, then a slim runtime with `ffmpeg`/`mpv`. |

## Backend on a NAS

```bash
git clone <repo> track_planner
cd track_planner/deployment
cp .env.example .env         # set PUBLIC_HOST to the NAS IP or hostname
docker compose -f docker-compose.backend.yml up -d --build
docker compose -f docker-compose.backend.yml logs -f backend
```

Requires Docker Compose v2.20+ (for `include`). The image is built on the NAS;
the first build downloads the whole monorepo's `node_modules`, so expect a few
minutes. Afterwards:

- Backend: `http://<PUBLIC_HOST>:3333/api`, GraphQL at `/graphql`, WebSocket `/playback`
- ArangoDB UI: `http://<PUBLIC_HOST>:8529` (root / `ARANGO_ROOT_PASSWORD`)
- MinIO API: `http://<PUBLIC_HOST>:9000`

Update after a code change:

```bash
git pull
docker compose -f docker-compose.backend.yml up -d --build backend
```

## Things to know

- **`PUBLIC_HOST` matters.** Audio and sheet-music links are presigned MinIO
  URLs signed for `MINIO_PUBLIC_ENDPOINT`. If clients cannot reach that host
  and port, downloads fail with a signature error.
- **Frontends are not included.** Rehearsal, Conductor, Moderator and
  Mixing Desk are static exports with `NEXT_PUBLIC_BACKEND_URL` baked in at
  build time. Build them with that variable set to `http://<PUBLIC_HOST>:3333`
  and serve the `out/` folders with any static file server.
- **Sound.** The backend plays audio itself via `mpv`/`ffplay`. A container on
  a NAS normally has no sound device, so playback is simulated (timers and
  positions still broadcast, but nothing is audible). See the commented
  `devices`/`group_add` block in `docker-compose.backend.yml` to pass through
  ALSA on a Linux host with a sound card.
- **CPU temperature widget** expects a LibreHardwareMonitor endpoint and is
  Windows-specific; leave `CPU_TEMP_URL` unset on a NAS.
