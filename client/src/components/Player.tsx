'use client';

import { PlaybackState, PlaybackStatus, Playlist } from '../lib/types';
import styles from './Player.module.css';

interface PlayerProps {
  playbackState: PlaybackState;
  activePlaylist: Playlist | null;
  isConnected: boolean;
  countInBeats: number;
  performanceMode?: boolean; // Performance mode - simplified controls
  onPlay: (playlistUid: string, trackIndex?: number) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onCountInChange: (beats: number) => void;
}

export function Player({
  playbackState,
  activePlaylist,
  isConnected,
  countInBeats,
  performanceMode = false,
  onPlay,
  onPause,
  onResume,
  onStop,
  onNext,
  onPrevious,
  onCountInChange,
}: PlayerProps) {
  const isActive = playbackState.status === PlaybackStatus.PLAYING
    || playbackState.status === PlaybackStatus.COUNT_IN;
  const isLoading = playbackState.status === PlaybackStatus.LOADING;
  const isPaused = playbackState.status === PlaybackStatus.PAUSED;
  const hasActiveTrack = playbackState.currentTrackTitle !== undefined;

  const handlePlayPause = () => {
    if (isActive) {
      onPause();
    } else if (isPaused) {
      onResume();
    } else if (activePlaylist) {
      onPlay(activePlaylist.uid, 0);
    }
  };

  return (
    <div className={`${styles.player} ${!isConnected ? styles.disconnected : ''} ${performanceMode ? styles.performanceMode : ''}`}>
      {/* Now Playing Info */}
      <div className={styles.nowPlaying}>
        <div className={styles.albumArt}>
          {isActive && (
            <div className={styles.equalizer}>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
          {!isActive && (
            <svg viewBox="0 0 24 24" fill="currentColor" className={styles.musicIcon}>
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          )}
        </div>
        <div className={styles.trackInfo}>
          <span className={styles.trackTitle}>
            {hasActiveTrack ? playbackState.currentTrackTitle : 'No track playing'}
          </span>
          <span className={styles.trackArtist}>
            {hasActiveTrack ? playbackState.currentTrackAuthor : 'Select a playlist to start'}
          </span>
          {playbackState.bpm && (
            <span className={styles.bpmBadge}>{playbackState.bpm} BPM</span>
          )}
        </div>
      </div>

      {/* Count-In Setting - only in rehearsal mode */}
      {!performanceMode && (
        <div className={styles.countInSetting}>
          <label className={styles.countInLabel}>
            <span>Count-in</span>
            <select 
              value={countInBeats} 
              onChange={(e) => onCountInChange(parseInt(e.target.value, 10))}
              className={styles.countInSelect}
            >
              <option value={0}>Off</option>
              <option value={2}>2 beats</option>
              <option value={4}>4 beats (1 bar)</option>
              <option value={8}>8 beats (2 bars)</option>
              <option value={16}>16 beats (4 bars)</option>
            </select>
          </label>
        </div>
      )}

      {/* Playback Controls */}
      <div className={styles.controls}>
        <button 
          className={styles.controlBtn}
          onClick={onPrevious}
          disabled={!isConnected || !hasActiveTrack}
          title="Previous"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button 
          className={`${styles.playBtn} ${isActive ? styles.playing : ''}`}
          onClick={handlePlayPause}
          disabled={!isConnected || isLoading || (!activePlaylist && !hasActiveTrack)}
          title={isActive ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <div className={styles.spinner} />
          ) : isActive ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button 
          className={styles.controlBtn}
          onClick={onNext}
          disabled={!isConnected || !hasActiveTrack}
          title="Next"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <button 
          className={`${styles.controlBtn} ${styles.stopBtn}`}
          onClick={onStop}
          disabled={!isConnected || playbackState.status === PlaybackStatus.IDLE}
          title="Stop"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h12v12H6z" />
          </svg>
        </button>
      </div>

      {/* Status Indicator */}
      <div className={styles.status}>
        <span className={`${styles.statusDot} ${isConnected ? styles.connected : ''}`} />
        <span className={styles.statusText}>
          {!isConnected
            ? 'Disconnected'
            : isLoading
              ? 'Loading...'
              : playbackState.status === PlaybackStatus.COUNT_IN
                ? 'Count-in...'
                : isActive
                  ? 'Playing on Server'
                  : isPaused
                    ? 'Paused'
                    : 'Ready'}
        </span>
      </div>
    </div>
  );
}
