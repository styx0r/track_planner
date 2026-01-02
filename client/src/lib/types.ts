/**
 * Shared types for client-server communication
 */

export enum PlaybackStatus {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  LOADING = 'loading',
}

export interface PlaybackState {
  status: string;
  playlistUid?: string;
  currentTrackIndex?: number;
  currentTrackUid?: string;
  currentTrackTitle?: string;
  currentTrackAuthor?: string;
  positionMs?: number;
  durationMs?: number;
  bpm?: number;
  metronomeOffset?: number; // Offset in ms for when metronome should start relative to song
  scheduledStartTime?: number; // When the song actually starts
  countInStartTime?: number; // When the count-in metronome starts (before song)
  countInBeats?: number; // Number of beats in the count-in
  sheetMusicUrl?: string; // URL to the sheet music PDF
  sheetMusicName?: string; // Name of the sheet music file
}

export interface MetronomeState {
  enabled: boolean;
  bpm: number;
  startTime?: number;
}

export interface PlaylistTrackSummary {
  uid: string;
  title: string;
  author: string;
  sheet_music_url?: string;
  sheet_music_name?: string;
}

export interface PlaylistTrack {
  music_uid: string;
  order: number;
  music?: PlaylistTrackSummary;
}

export interface Playlist {
  uid: string;
  name: string;
  description?: string;
  creation_timestamp: string;
  update_timestamp: string;
  tracks: PlaylistTrack[];
}

export interface TimeSyncRequest {
  t0: number;
}

export interface TimeSyncResponse {
  t0: number;
  t1: number;
  t2: number;
}

export const WS_EVENTS = {
  // Client -> Server
  TIME_SYNC: 'time:sync',
  PLAY: 'playback:play',
  PAUSE: 'playback:pause',
  STOP: 'playback:stop',
  NEXT: 'playback:next',
  PREVIOUS: 'playback:previous',
  SEEK: 'playback:seek',
  METRONOME_TOGGLE: 'metronome:toggle',
  METRONOME_SET_BPM: 'metronome:setBpm',
  GET_STATE: 'playback:getState',

  // Server -> Client
  TIME_SYNC_RESPONSE: 'time:sync:response',
  PLAYBACK_STATE: 'playback:state',
  PLAYBACK_STARTED: 'playback:started',
  PLAYBACK_PAUSED: 'playback:paused',
  PLAYBACK_STOPPED: 'playback:stopped',
  PLAYBACK_ERROR: 'playback:error',
  PLAYBACK_TRACK_CHANGED: 'playback:trackChanged',
  METRONOME_STATE: 'metronome:state',
} as const;

