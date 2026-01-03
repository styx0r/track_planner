'use client';

import { Playlist, PlaybackState, PlaybackStatus } from '../lib/types';
import styles from './PlaylistCard.module.css';

interface PlaylistCardProps {
  playlist: Playlist;
  isActive: boolean;
  playbackState: PlaybackState;
  onSelect: (playlist: Playlist) => void;
  onPlayTrack: (playlistUid: string, trackIndex: number) => void;
}

export function PlaylistCard({
  playlist,
  isActive,
  playbackState,
  onSelect,
  onPlayTrack,
}: PlaylistCardProps) {
  const isPlaying = playbackState.status === PlaybackStatus.PLAYING;
  const isCurrentPlaylist = playbackState.playlistUid === playlist.uid;

  return (
    <div 
      className={`${styles.card} ${isActive ? styles.active : ''}`}
      onClick={() => onSelect(playlist)}
    >
      <div className={styles.header}>
        <div className={styles.icon}>
          {isCurrentPlaylist && isPlaying ? (
            <div className={styles.playingIcon}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
            </svg>
          )}
        </div>
        <div className={styles.info}>
          <h3 className={styles.name}>{playlist.name}</h3>
          <p className={styles.description}>
            {playlist.description || `${playlist.tracks.length} tracks`}
          </p>
        </div>
      </div>

      <div className={styles.tracks}>
        {playlist.tracks.slice(0, 5).map((track, index) => (
          <div 
            key={track.music_uid}
            className={`
              ${styles.track}
              ${isCurrentPlaylist && playbackState.currentTrackIndex === index ? styles.playing : ''}
            `}
            onClick={(e) => {
              e.stopPropagation();
              onPlayTrack(playlist.uid, index);
            }}
          >
            <span className={styles.trackNumber}>{index + 1}</span>
            <div className={styles.trackInfo}>
              <span className={styles.trackTitle}>
                {track.music?.title || 'Unknown Track'}
              </span>
              <span className={styles.trackArtist}>
                {track.music?.author || 'Unknown Artist'}
              </span>
            </div>
            <button className={styles.playBtn} title="Play track">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        ))}
        {playlist.tracks.length > 5 && (
          <div className={styles.more}>
            +{playlist.tracks.length - 5} more tracks
          </div>
        )}
      </div>
    </div>
  );
}



