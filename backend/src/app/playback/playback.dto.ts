import { ObjectType, Field, Int, Float, ID } from '@nestjs/graphql';
import { SheetMusic } from '../music/music.dto';

/**
 * Playback state types for client-server synchronization
 */

export enum PlaybackStatus {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  LOADING = 'loading',
  COUNT_IN = 'count_in', // During count-in phase before song starts
  MODERATION = 'moderation', // Current item is a moderation text (no audio)
}

@ObjectType()
export class PlaybackState {
  @Field()
  status!: string;

  @Field(() => ID, { nullable: true })
  playlistUid?: string;

  @Field(() => Int, { nullable: true })
  currentTrackIndex?: number;

  @Field(() => ID, { nullable: true })
  currentTrackUid?: string;

  @Field({ nullable: true })
  currentTrackTitle?: string;

  @Field({ nullable: true })
  currentTrackAuthor?: string;

  @Field({ nullable: true })
  currentTrackPerformer?: string;

  @Field({ nullable: true })
  timeSignature?: string;

  @Field(() => Float, { nullable: true })
  positionMs?: number;

  @Field(() => Float, { nullable: true })
  durationMs?: number;

  @Field(() => Int, { nullable: true })
  bpm?: number;

  @Field(() => Float, { nullable: true })
  metronomeOffset?: number; // Offset in ms for metronome relative to song start

  @Field(() => Float, { nullable: true })
  scheduledStartTime?: number; // When the song actually starts (server time)

  @Field(() => Float, { nullable: true })
  countInStartTime?: number; // When count-in starts (server time)

  @Field(() => Int, { nullable: true })
  countInBeats?: number; // Number of count-in beats

  @Field(() => [SheetMusic], { nullable: true })
  sheets?: SheetMusic[]; // Sheet music files for current track

  @Field({ nullable: true })
  audioUrl?: string; // Direct URL to the audio file (for waveform generation)

  // Full-items navigation (not a GraphQL field — WS-only)
  currentItemIndex?: number;
  currentModerationText?: string;
  currentModerationAuthor?: string;
  playlistItems?: any[]; // Full hydrated playlist items broadcast on playlist load
  performanceStartTime?: number; // Server timestamp set by mixing desk
}

/**
 * Time sync response for client-server time synchronization
 * Uses NTP-like algorithm:
 * - t0: client send time (echoed back)
 * - t1: server receive time
 * - t2: server send time
 * Client calculates offset: ((t1 - t0) + (t2 - t3)) / 2
 * where t3 is client receive time
 */
export interface TimeSyncRequest {
  t0: number; // Client's local timestamp when sending
}

export interface TimeSyncResponse {
  t0: number; // Echo back client's timestamp
  t1: number; // Server's receive timestamp
  t2: number; // Server's send timestamp
}

/**
 * Playback control commands from client
 */
export interface PlayCommand {
  playlistUid: string;
  trackIndex?: number; // Optional: start from specific track
  scheduledTime?: number; // Optional: synchronized start time
  countInBeats?: number; // Optional: number of count-in beats before song
}

export interface SeekCommand {
  positionMs: number;
}

export interface MetronomeState {
  enabled: boolean;
  bpm: number;
  startTime?: number; // Synchronized start time for metronome
  countInBeats?: number; // Number of count-in beats
}

/**
 * WebSocket event types
 */
export const WS_EVENTS = {
  // Client -> Server
  TIME_SYNC: 'time:sync',
  PLAY: 'playback:play',
  PAUSE: 'playback:pause',
  RESUME: 'playback:resume',
  STOP: 'playback:stop',
  NEXT: 'playback:next',
  PREVIOUS: 'playback:previous',
  SEEK: 'playback:seek',
  METRONOME_TOGGLE: 'metronome:toggle',
  METRONOME_SET_BPM: 'metronome:setBpm',
  METRONOME_SET_COUNT_IN: 'metronome:setCountIn',
  LOAD_PLAYLIST: 'playback:loadPlaylist',
  START_PERFORMANCE: 'performance:start',
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
  PERFORMANCE_STARTED: 'performance:started',
} as const;
