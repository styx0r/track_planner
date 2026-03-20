import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { PlaybackState, PlaybackStatus, MetronomeState } from './playback.dto';
import { PlaylistService } from '../playlist/playlist.service';
import { MusicService } from '../music/music.service';
import { MinioService } from '../music/minio.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';

@Injectable()
export class PlaybackService {
  private readonly logger = new Logger(PlaybackService.name);

  // Current playback state
  private currentState: PlaybackState = {
    status: PlaybackStatus.IDLE,
  };

  // Metronome state
  private metronomeState: MetronomeState = {
    enabled: true, // Auto-enabled by default
    bpm: 120,
  };

  // Count-in configuration
  private defaultCountInBeats: number = 4;

  // Audio player process (using ffplay, mpv, or similar)
  private playerProcess: ChildProcess | null = null;
  private playbackStartTime: number | null = null;
  private currentPlaylist: any = null;
  private tempFilePath: string | null = null;
  private playbackTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly playlistService: PlaylistService,
    private readonly musicService: MusicService,
    // MinioService available for future use (e.g., direct file streaming)
    _minioService: MinioService,
  ) {}

  /**
   * Get current playback state
   */
  getState(): PlaybackState {
    return { ...this.currentState };
  }

  /**
   * Get metronome state
   */
  getMetronomeState(): MetronomeState {
    return { ...this.metronomeState };
  }

  /**
   * Set default count-in beats
   */
  setCountInBeats(beats: number): MetronomeState {
    this.defaultCountInBeats = Math.max(0, Math.min(32, beats));
    this.metronomeState.countInBeats = this.defaultCountInBeats;
    return this.getMetronomeState();
  }

  /**
   * Start playback of a playlist with optional count-in
   * @param playlistUid - UID of the playlist to play
   * @param trackIndex - Starting track index (default: 0)
   * @param countInBeats - Number of count-in beats before song starts (default: from settings)
   */
  async play(
    playlistUid: string,
    trackIndex: number = 0,
    countInBeats?: number,
  ): Promise<PlaybackState> {
    this.logger.log(`Starting playback for playlist: ${playlistUid}, track: ${trackIndex}`);

    // Stop any current playback
    await this.stop();

    // Fetch playlist
    const playlist = await this.playlistService.getPlaylist(playlistUid);
    if (!playlist || playlist.tracks.length === 0) {
      throw new NotFoundException('Playlist not found or empty');
    }

    this.currentPlaylist = playlist;

    if (trackIndex >= playlist.tracks.length) {
      trackIndex = 0;
    }

    const track = playlist.tracks[trackIndex];
    const music = await this.musicService.getMusicById(track.music_uid);

    // Use provided countInBeats or default
    const effectiveCountInBeats = countInBeats ?? this.defaultCountInBeats;
    
    // Get BPM from music or use default
    const bpm = music.bpm || this.metronomeState.bpm;
    const beatDurationMs = 60000 / bpm;
    
    // Calculate timing
    // Count-in starts at the next round second + small buffer
    const now = Date.now();
    const countInStartTime = this.calculateSyncedStartTime(500);
    
    // Song starts after count-in beats complete
    const countInDurationMs = effectiveCountInBeats * beatDurationMs;
    const songStartTime = effectiveCountInBeats > 0 
      ? countInStartTime + countInDurationMs 
      : countInStartTime;

    // Update state
    this.currentState = {
      status: effectiveCountInBeats > 0 ? PlaybackStatus.COUNT_IN : PlaybackStatus.LOADING,
      playlistUid,
      currentTrackIndex: trackIndex,
      currentTrackUid: track.music_uid,
      currentTrackTitle: music.title,
      currentTrackAuthor: music.author,
      bpm: bpm,
      metronomeOffset: (music as any).metronome_offset || 0, // Get from music if available
      scheduledStartTime: songStartTime,
      countInStartTime: effectiveCountInBeats > 0 ? countInStartTime : undefined,
      countInBeats: effectiveCountInBeats > 0 ? effectiveCountInBeats : undefined,
      sheets: (music as any).sheets || [],
    };

    // Update metronome state
    this.metronomeState.bpm = bpm;
    this.metronomeState.startTime = songStartTime;
    this.metronomeState.countInBeats = effectiveCountInBeats;
    this.metronomeState.enabled = true; // Auto-enable metronome

    // Calculate delay until song should start
    const delayUntilSongStart = songStartTime - now;
    
    this.logger.log(`Count-in: ${effectiveCountInBeats} beats at ${bpm} BPM`);
    this.logger.log(`Count-in starts at: ${countInStartTime}, Song starts at: ${songStartTime}`);
    this.logger.log(`Delay until song start: ${delayUntilSongStart}ms`);

    // Schedule playback to start at the exact song start time
    this.playbackTimeout = setTimeout(async () => {
      try {
        await this.startAudioPlayback(music.file_url, music.file_name);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to start playback: ${msg}`);
        this.currentState.status = PlaybackStatus.IDLE;
      }
    }, delayUntilSongStart);

    return this.getState();
  }

  /**
   * Start actual audio playback using external player
   */
  private async startAudioPlayback(fileUrl: string, fileName: string): Promise<void> {
    try {
      // Download file to temp location for playback
      const tempDir = os.tmpdir();
      this.tempFilePath = path.join(tempDir, `track_planner_${Date.now()}_${fileName}`);
      
      await this.downloadFile(fileUrl, this.tempFilePath);
      
      // Try different players in order of preference
      const players = ['mpv', 'ffplay', 'afplay']; // afplay is macOS-specific
      let playerFound = false;

      for (const player of players) {
        try {
          await this.tryStartPlayer(player, this.tempFilePath);
          playerFound = true;
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          this.logger.debug(`Player ${player} not available: ${msg}`);
        }
      }

      if (!playerFound) {
        this.logger.warn('No audio player found. Playback will be simulated.');
        // Simulate playback for testing
        this.playbackStartTime = Date.now();
      }

      this.currentState.status = PlaybackStatus.PLAYING;
      this.playbackStartTime = Date.now();
      
      this.logger.log(`Audio playback started for: ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to start audio playback: ${message}`);
      this.currentState.status = PlaybackStatus.IDLE;
      throw error;
    }
  }

  /**
   * Download file from URL to local path
   */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const protocol = url.startsWith('https') ? https : http;
      
      protocol.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
            return;
          }
        }
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(err);
      });
    });
  }

  /**
   * Get the executable path for a player, checking environment variables
   */
  private getPlayerExecutable(player: string): string {
    if (player === 'mpv') {
      // Use MPV_PATH env variable if set (useful for Windows where mpv.exe might not be in PATH)
      return process.env.MPV_PATH || 'mpv';
    }
    return player;
  }

  /**
   * Try to start a specific audio player
   */
  private async tryStartPlayer(player: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let args: string[];
      
      switch (player) {
        case 'mpv':
          args = ['--no-video', '--no-terminal', filePath];
          break;
        case 'ffplay':
          args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath];
          break;
        case 'afplay':
          args = [filePath];
          break;
        default:
          args = [filePath];
      }

      const executable = this.getPlayerExecutable(player);
      this.playerProcess = spawn(executable, args, {
        detached: false,
        stdio: 'ignore',
      });

      this.playerProcess.on('error', (error) => {
        reject(error);
      });

      this.playerProcess.on('spawn', () => {
        this.logger.log(`Started audio playback with ${executable}`);
        resolve();
      });

      this.playerProcess.on('exit', (code) => {
        this.logger.log(`Player ${player} exited with code ${code}`);
        this.onPlaybackEnded();
      });
    });
  }

  /**
   * Handle playback ended event
   */
  private async onPlaybackEnded(): Promise<void> {
    // Clean up temp file
    if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
      fs.unlinkSync(this.tempFilePath);
      this.tempFilePath = null;
    }

    // Auto-advance to next track
    if (
      this.currentState.status === PlaybackStatus.PLAYING &&
      this.currentPlaylist &&
      this.currentState.currentTrackIndex !== undefined
    ) {
      const nextIndex = this.currentState.currentTrackIndex + 1;
      if (nextIndex < this.currentPlaylist.tracks.length) {
        this.logger.log(`Auto-advancing to track ${nextIndex}`);
        // Small delay before next track
        setTimeout(() => {
          this.play(
            this.currentState.playlistUid!,
            nextIndex,
            this.metronomeState.countInBeats,
          );
        }, 500);
        return;
      }
    }

    // Playlist finished or stopped
    this.currentState.status = PlaybackStatus.IDLE;
    this.playerProcess = null;
    this.playbackStartTime = null;
  }

  /**
   * Pause current playback
   */
  async pause(): Promise<PlaybackState> {
    if (this.playerProcess) {
      // Send SIGSTOP to pause (Unix only)
      this.playerProcess.kill('SIGSTOP');
      this.currentState.status = PlaybackStatus.PAUSED;
      
      if (this.playbackStartTime) {
        this.currentState.positionMs = Date.now() - this.playbackStartTime;
      }
    }
    
    return this.getState();
  }

  /**
   * Resume paused playback
   */
  async resume(): Promise<PlaybackState> {
    if (this.playerProcess && this.currentState.status === PlaybackStatus.PAUSED) {
      // Send SIGCONT to resume (Unix only)
      this.playerProcess.kill('SIGCONT');
      this.currentState.status = PlaybackStatus.PLAYING;
    }
    
    return this.getState();
  }

  /**
   * Stop playback completely
   */
  async stop(): Promise<PlaybackState> {
    // Clear any pending playback timeout
    if (this.playbackTimeout) {
      clearTimeout(this.playbackTimeout);
      this.playbackTimeout = null;
    }

    if (this.playerProcess) {
      this.playerProcess.kill('SIGTERM');
      this.playerProcess = null;
    }

    // Clean up temp file
    if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
      try {
        fs.unlinkSync(this.tempFilePath);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        this.logger.warn(`Failed to delete temp file: ${msg}`);
      }
      this.tempFilePath = null;
    }

    this.currentState = {
      status: PlaybackStatus.IDLE,
    };
    this.playbackStartTime = null;
    this.currentPlaylist = null;

    return this.getState();
  }

  /**
   * Skip to next track
   */
  async next(): Promise<PlaybackState> {
    if (!this.currentPlaylist || this.currentState.currentTrackIndex === undefined) {
      return this.getState();
    }

    const nextIndex = this.currentState.currentTrackIndex + 1;
    if (nextIndex >= this.currentPlaylist.tracks.length) {
      return this.stop();
    }

    return this.play(this.currentState.playlistUid!, nextIndex, this.metronomeState.countInBeats);
  }

  /**
   * Go to previous track
   */
  async previous(): Promise<PlaybackState> {
    if (!this.currentPlaylist || this.currentState.currentTrackIndex === undefined) {
      return this.getState();
    }

    const prevIndex = Math.max(0, this.currentState.currentTrackIndex - 1);
    return this.play(this.currentState.playlistUid!, prevIndex, this.metronomeState.countInBeats);
  }

  /**
   * Toggle metronome on/off
   */
  toggleMetronome(enabled?: boolean): MetronomeState {
    if (enabled !== undefined) {
      this.metronomeState.enabled = enabled;
    } else {
      this.metronomeState.enabled = !this.metronomeState.enabled;
    }

    // Set start time if playback is active
    if (this.metronomeState.enabled && this.playbackStartTime) {
      this.metronomeState.startTime = this.playbackStartTime;
    }

    return this.getMetronomeState();
  }

  /**
   * Set metronome BPM
   */
  setMetronomeBpm(bpm: number): MetronomeState {
    this.metronomeState.bpm = Math.max(20, Math.min(300, bpm));
    return this.getMetronomeState();
  }

  /**
   * Calculate next synchronized start time
   * Returns a timestamp rounded to the next full second + buffer
   */
  calculateSyncedStartTime(bufferMs: number = 1000): number {
    const now = Date.now();
    const nextSecond = Math.ceil(now / 1000) * 1000;
    return nextSecond + bufferMs;
  }
}
