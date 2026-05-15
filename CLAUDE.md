# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build individual apps
npx nx build @track-planner/backend
npx nx build @track-planner/backoffice
npx nx build @track-planner/rehearsal
npx nx build @track-planner/conductor
npx nx build @track-planner/moderator
npx nx build @track-planner/mixing-desk

# Dev mode (all apps concurrently)
npm run dev:all

# Dev mode (single app)
npx nx dev @track-planner/rehearsal --port 3001
npx nx dev @track-planner/conductor --port 3002
npx nx dev @track-planner/moderator --port 3003
npx nx dev @track-planner/mixing-desk --port 3004
npx nx dev @track-planner/backoffice

# Backend (NestJS, port 3333)
npx nx serve @track-planner/backend

# Type-check only
npx nx typecheck @track-planner/backoffice

# Tests
npx nx test @track-planner/backend
```

Default ports: backend=3333, rehearsal=3001, conductor=3002, moderator=3003, mixing-desk=3004, backoffice=3000.

## Architecture

This is an Nx monorepo for synchronized multi-device music performance tooling. All real-time state lives on the **backend** (NestJS); clients are display-only consumers connected via Socket.io.

### Backend (`backend/`)
- **NestJS** with a single **WebSocket gateway** (`/playback` namespace) for all real-time events.
- `PlaybackService` holds the single source of truth for playback state — position, current track, metronome, etc. Clients receive state snapshots on connect and via broadcast events.
- Playlist items have two types: `TRACK` and `MODERATION_TEXT`. Navigating `next`/`previous` steps through all items including moderations.
- Audio playback runs server-side via `ffplay` spawned as a child process. The backend broadcasts a `scheduledStartTime` (server wall-clock ms) so all clients can derive the playback position without querying the server.
- **ArangoDB** for all persistent data. Collections: `music`, `playlists`, `moderation_texts`, `moderation_categories`, `genres`.
- **MinIO** for audio files, sheet music (PDFs/images, pre-converted to PNG pages), and thumbnails.
- Schema is auto-generated from NestJS decorators into `backend/src/schema.gql` on server start — do not edit `schema.gql` manually.

### Time Synchronization
All frontend apps run an NTP-like sync on connect (`timeSync.ts`). The result is a clock `offset` (client minus server). To convert a server-issued `scheduledStartTime` to local time: `localTime = serverTime - offset`. This is used to drive waveform progress animation and metronome beats without polling. See `rehearsal/src/lib/timeSync.ts`.

### Frontend Apps
All Next.js (App Router), all `'use client'` pages. Each app connects to the backend WebSocket on mount.

| App | Role |
|-----|------|
| **mixing-desk** | Controls playback: loads playlists, play/pause/stop, seek, start performance timer. The "conductor" of server state. |
| **conductor** | Large-screen display for the band leader. Shows current/next item, sheet music, beat dots, waveform. Read-only navigation arrows (prev/next) and a play button for A Capella tracks. |
| **moderator** | Text display for the emcee. Shows moderation text for the current or upcoming slot, plus songs before/after the slot. |
| **rehearsal** | Practice mode. Both reads server state and independently drives `play`/`seek`/`stop`. Has full metronome controls, count-in, waveform seek. |
| **backoffice** | CRUD for music library (upload audio + sheet music, metadata) and playlists. Uses GraphQL over HTTP. |

### `usePlayback` Hook
Each frontend app has its own copy of `usePlayback.ts` (they're not shared). It wraps Socket.io, handles reconnection, performs time sync, and exposes typed actions (`play`, `seek`, `toggleMetronome`, etc.) matching `WS_EVENTS` in `playback.dto.ts`.

### Waveform
Two implementations exist:
- **Rehearsal** (`WaveformProgressBar.tsx`): Fetches audio URL, decodes in-browser via `AudioContext`, normalizes to 120 bars. Results are module-level cached by URL.
- **Conductor** (`WaveformProgressBar.tsx`): Uses precomputed `waveform: number[]` sent in the playback state (generated server-side with `ffmpeg` on upload and stored in ArangoDB).

The rehearsal version supports seeking via click. The conductor version is display-only.

### Metronome
The `Metronome` component in rehearsal handles both audio (Web Audio API clicks via `metronomeAudio.ts`) and visual beat display. It runs a `requestAnimationFrame` loop comparing `Date.now()` against the local-corrected start time. `metronomeOffset` (stored per-track in DB) shifts the metronome start relative to the audio start.

### Genre
`genre` is a free-form string on music documents. Valid genres are stored in the `genres` ArangoDB collection and managed via GraphQL (`query genres`, `mutation createGenre`, `mutation deleteGenre`). Songs with a genre not in the collection are treated as orphaned and displayed as `–` in the UI.

### PlaylistItem Navigation
`playlistItems` in the playback state is the full ordered array of `TRACK` and `MODERATION_TEXT` items. `currentItemIndex` is the index into this array. `currentTrackIndex` is the index counting only `TRACK` items — used when calling `play(playlistUid, trackIndex)`.

## Infrastructure
- Backend `.env` at `backend/.env` (not `root/.env`). Key vars: `ARANGODB_URL`, `MINIO_*`, `NEXT_PUBLIC_BACKEND_URL`.
- Backend GraphQL playground at `http://localhost:3333/graphql`.
- Frontend apps proxy `/api/graphql` and `/api/music/*` to the backend via Next.js API route rewrites.
