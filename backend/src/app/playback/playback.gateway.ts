import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PlaybackService } from './playback.service';
import {
  WS_EVENTS,
  TimeSyncResponse,
} from './playback.dto';

// Define message body classes for proper decorator metadata
class TimeSyncMessage {
  t0!: number;
}

class PlayMessage {
  playlistUid!: string;
  trackIndex?: number;
  scheduledTime?: number;
  countInBeats?: number;
}

class MetronomeToggleMessage {
  enabled?: boolean;
}

class MetronomeBpmMessage {
  bpm!: number;
}

class CountInMessage {
  beats!: number;
}

class SeekMessage {
  positionMs!: number;
}

class StartPerformanceMessage {
  // no payload required; server uses Date.now()
}

class LoadPlaylistMessage {
  playlistUid!: string;
}

@WebSocketGateway({
  cors: {
    origin: '*', // In production, restrict to specific origins
    credentials: true,
  },
  namespace: '/playback',
})
export class PlaybackGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PlaybackGateway.name);
  private connectedClients: Map<string, Socket> = new Map();

  constructor(private readonly playbackService: PlaybackService) {}

  afterInit(server: Server): void {
    this.playbackService.setBroadcastFn((event, data) => server.emit(event, data));
  }

  /**
   * Handle new client connection
   */
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, client);

    // Send current playback state to newly connected client
    client.emit(WS_EVENTS.PLAYBACK_STATE, this.playbackService.getState());
    client.emit(WS_EVENTS.METRONOME_STATE, this.playbackService.getMetronomeState());
    const performanceStartTime = this.playbackService.getPerformanceStartTime();
    if (performanceStartTime !== null) {
      client.emit(WS_EVENTS.PERFORMANCE_STARTED, { performanceStartTime });
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  /**
   * Time synchronization handler
   * Implements NTP-like algorithm for client-server clock synchronization
   */
  @SubscribeMessage(WS_EVENTS.TIME_SYNC)
  handleTimeSync(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TimeSyncMessage,
  ): void {
    const t1 = Date.now(); // Server receive time
    const response: TimeSyncResponse = {
      t0: data.t0,
      t1: t1,
      t2: Date.now(), // Server send time
    };
    client.emit(WS_EVENTS.TIME_SYNC_RESPONSE, response);
  }

  /**
   * Start playback command with optional count-in
   */
  @SubscribeMessage(WS_EVENTS.PLAY)
  async handlePlay(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: PlayMessage,
  ): Promise<void> {
    try {
      this.logger.log(`Play command received: ${JSON.stringify(data)}`);

      // Start playback with count-in
      // The service calculates all timing including count-in and song start times
      const state = await this.playbackService.play(
        data.playlistUid,
        data.trackIndex || 0,
        data.countInBeats,
      );

      // Broadcast to all clients with all timing information
      this.broadcastState(WS_EVENTS.PLAYBACK_STARTED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Play error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  @SubscribeMessage(WS_EVENTS.RESET_PERFORMANCE)
  handleResetPerformance(): void {
    const state = this.playbackService.resetPerformance();
    this.broadcastState(WS_EVENTS.PLAYBACK_STATE, state);
  }

  @SubscribeMessage(WS_EVENTS.SET_DISPLAY_LOCK)
  handleSetDisplayLock(
    @MessageBody() data: { locked: boolean },
  ): void {
    const state = this.playbackService.setDisplayLock(data.locked);
    this.broadcastState(WS_EVENTS.PLAYBACK_STATE, state);
  }

  @SubscribeMessage(WS_EVENTS.PLAY_TRACK)
  async handlePlayTrack(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { musicUid: string; positionMs?: number },
  ): Promise<void> {
    try {
      const state = await this.playbackService.playTrack(data.musicUid, data.positionMs ?? 0);
      this.broadcastState(WS_EVENTS.PLAYBACK_STARTED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`PlayTrack error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Pause playback command
   */
  @SubscribeMessage(WS_EVENTS.PAUSE)
  async handlePause(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const state = await this.playbackService.pause();
      this.broadcastState(WS_EVENTS.PLAYBACK_PAUSED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Pause error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Resume paused playback command
   */
  @SubscribeMessage(WS_EVENTS.RESUME)
  async handleResume(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const state = await this.playbackService.resume();
      this.broadcastState(WS_EVENTS.PLAYBACK_STARTED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Resume error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Stop playback command
   */
  @SubscribeMessage(WS_EVENTS.STOP)
  async handleStop(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const state = await this.playbackService.stop();
      this.broadcastState(WS_EVENTS.PLAYBACK_STOPPED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Stop error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Reset the selected program for all clients.
   */
  @SubscribeMessage(WS_EVENTS.RESET_PROGRAM)
  async handleResetProgram(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const state = await this.playbackService.resetProgram();
      this.broadcastState(WS_EVENTS.PLAYBACK_STOPPED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Reset program error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Next track command
   */
  @SubscribeMessage(WS_EVENTS.NEXT)
  async handleNext(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const state = await this.playbackService.next();
      this.broadcastState(WS_EVENTS.PLAYBACK_TRACK_CHANGED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Next error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Previous track command
   */
  @SubscribeMessage(WS_EVENTS.PREVIOUS)
  async handlePrevious(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const state = await this.playbackService.previous();
      this.broadcastState(WS_EVENTS.PLAYBACK_TRACK_CHANGED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Previous error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Toggle metronome
   */
  @SubscribeMessage(WS_EVENTS.METRONOME_TOGGLE)
  handleMetronomeToggle(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: MetronomeToggleMessage,
  ): void {
    const state = this.playbackService.toggleMetronome(data?.enabled);
    this.broadcastState(WS_EVENTS.METRONOME_STATE, state);
  }

  /**
   * Set metronome BPM
   */
  @SubscribeMessage(WS_EVENTS.METRONOME_SET_BPM)
  handleSetMetronomeBpm(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: MetronomeBpmMessage,
  ): void {
    const state = this.playbackService.setMetronomeBpm(data.bpm);
    this.broadcastState(WS_EVENTS.METRONOME_STATE, state);
  }

  /**
   * Set count-in beats
   */
  @SubscribeMessage(WS_EVENTS.METRONOME_SET_COUNT_IN)
  handleSetCountIn(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: CountInMessage,
  ): void {
    const state = this.playbackService.setCountInBeats(data.beats);
    this.broadcastState(WS_EVENTS.METRONOME_STATE, state);
  }

  /**
   * Seek to position in current track
   */
  @SubscribeMessage(WS_EVENTS.SEEK)
  async handleSeek(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SeekMessage,
  ): Promise<void> {
    try {
      const state = await this.playbackService.seek(data.positionMs);
      this.broadcastState(WS_EVENTS.PLAYBACK_STARTED, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Seek error: ${message}`);
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Request current state
   */
  @SubscribeMessage(WS_EVENTS.GET_STATE)
  handleGetState(@ConnectedSocket() client: Socket): void {
    client.emit(WS_EVENTS.PLAYBACK_STATE, this.playbackService.getState());
    client.emit(WS_EVENTS.METRONOME_STATE, this.playbackService.getMetronomeState());
    const performanceStartTime = this.playbackService.getPerformanceStartTime();
    if (performanceStartTime !== null) {
      client.emit(WS_EVENTS.PERFORMANCE_STARTED, { performanceStartTime });
    }
  }

  /**
   * Load playlist without starting audio
   */
  @SubscribeMessage(WS_EVENTS.LOAD_PLAYLIST)
  async handleLoadPlaylist(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LoadPlaylistMessage,
  ): Promise<void> {
    try {
      const state = await this.playbackService.loadPlaylist(data.playlistUid);
      this.broadcastState(WS_EVENTS.PLAYBACK_STATE, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit(WS_EVENTS.PLAYBACK_ERROR, { message });
    }
  }

  /**
   * Start performance clock (called by mixing desk)
   */
  @SubscribeMessage(WS_EVENTS.START_PERFORMANCE)
  handleStartPerformance(
    @ConnectedSocket() _client: Socket,
    @MessageBody() _data: StartPerformanceMessage,
  ): void {
    this.playbackService.startPerformance();
  }

  /**
   * Broadcast state to all connected clients
   */
  private broadcastState(event: string, data: any): void {
    this.server.emit(event, data);
  }
}

