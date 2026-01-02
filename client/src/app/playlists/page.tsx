'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlayback } from '../../lib/usePlayback';
import { fetchPlaylistsApi } from '../../lib/useApi';
import { Playlist } from '../../lib/types';
import { Player } from '../../components/Player';
import { Metronome } from '../../components/Metronome';
import { PlaylistCard } from '../../components/PlaylistCard';
import { SheetMusicViewer } from '../../components/SheetMusicViewer';
import styles from './page.module.css';

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Count-in settings
  const [countInBeats, setCountInBeats] = useState(4); // Default 4 beats count-in
  
  // Manual metronome offset in milliseconds (used when no song-specific offset exists)
  const [manualMetronomeOffset, setManualMetronomeOffset] = useState(0);

  const {
    isConnected,
    isLoading: isConnecting,
    error: connectionError,
    syncResult,
    isSyncing,
    playbackState,
    metronomeState,
    scheduledLocalStartTime,
    countInStartTime,
    connect,
    disconnect,
    resync,
    play,
    pause,
    stop,
    next,
    previous,
    toggleMetronome,
    setMetronomeBpm,
    setCountIn,
  } = usePlayback();

  // Load playlists on mount - only once
  useEffect(() => {
    let mounted = true;
    
    const loadPlaylists = async () => {
      try {
        setIsLoadingPlaylists(true);
        setLoadError(null);
        const data = await fetchPlaylistsApi();
        if (mounted) {
          setPlaylists(data);
        }
      } catch (err) {
        if (mounted) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load playlists');
        }
      } finally {
        if (mounted) {
          setIsLoadingPlaylists(false);
        }
      }
    };
    
    loadPlaylists();
    
    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array - only run once

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, []); // Empty dependency array - connect/disconnect are stable refs

  const handleSelectPlaylist = useCallback((playlist: Playlist) => {
    setSelectedPlaylist(playlist);
  }, []);

  const handlePlayTrack = useCallback((playlistUid: string, trackIndex: number) => {
    // Find and select the playlist if not already selected
    const playlist = playlists.find(p => p.uid === playlistUid);
    if (playlist) {
      setSelectedPlaylist(playlist);
    }
    play(playlistUid, trackIndex, countInBeats);
  }, [playlists, play, countInBeats]);

  const handleCountInChange = useCallback((beats: number) => {
    setCountInBeats(beats);
    setCountIn(beats);
  }, [setCountIn]);

  const handleRefreshPlaylists = useCallback(async () => {
    try {
      setIsLoadingPlaylists(true);
      setLoadError(null);
      const data = await fetchPlaylistsApi();
      setPlaylists(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load playlists');
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, []);

  // Get current sheet music URL from playback state or selected playlist
  const currentSheetMusic = useMemo(() => {
    // First priority: from playback state (playing track)
    if (playbackState.sheetMusicUrl) {
      return {
        url: playbackState.sheetMusicUrl,
        title: playbackState.currentTrackTitle || 'Sheet Music',
      };
    }
    
    // Second priority: from selected playlist's current track
    if (selectedPlaylist && playbackState.currentTrackIndex !== undefined) {
      const track = selectedPlaylist.tracks[playbackState.currentTrackIndex];
      if (track?.music?.sheet_music_url) {
        return {
          url: track.music.sheet_music_url,
          title: track.music.title || 'Sheet Music',
        };
      }
    }
    
    return null;
  }, [playbackState.sheetMusicUrl, playbackState.currentTrackTitle, playbackState.currentTrackIndex, selectedPlaylist]);

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Track Planner</h1>
          <p className={styles.subtitle}>Remote Playback Controller</p>
        </div>
        <div className={styles.syncStatus}>
          {isSyncing ? (
            <span className={styles.syncing}>Synchronizing...</span>
          ) : syncResult ? (
            <button className={styles.syncBtn} onClick={resync} title="Re-synchronize">
              <span className={styles.syncIndicator} />
              Synced ({syncResult.accuracy.toFixed(1)}ms accuracy)
            </button>
          ) : (
            <span className={styles.notSynced}>Not synchronized</span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {/* Left Panel - Player & Metronome */}
        <aside className={styles.sidebar}>
          <Player
            playbackState={playbackState}
            activePlaylist={selectedPlaylist}
            isConnected={isConnected}
            countInBeats={countInBeats}
            onPlay={(uid, idx) => play(uid, idx, countInBeats)}
            onPause={pause}
            onStop={stop}
            onNext={next}
            onPrevious={previous}
            onCountInChange={handleCountInChange}
          />

          <Metronome
            enabled={metronomeState.enabled}
            bpm={playbackState.bpm || metronomeState.bpm}
            startTime={scheduledLocalStartTime}
            countInStartTime={countInStartTime}
            countInBeats={countInBeats}
            metronomeOffset={playbackState.metronomeOffset ?? manualMetronomeOffset}
            onToggle={toggleMetronome}
            onBpmChange={setMetronomeBpm}
            onOffsetChange={setManualMetronomeOffset}
          />

          {/* Sync Debug Info */}
          {syncResult && (
            <div className={styles.debugPanel}>
              <h4>Sync Details</h4>
              <dl>
                <dt>Offset</dt>
                <dd>{syncResult.offset.toFixed(2)}ms</dd>
                <dt>Latency</dt>
                <dd>{syncResult.roundTrip.toFixed(2)}ms</dd>
                <dt>Samples</dt>
                <dd>{syncResult.samples}</dd>
              </dl>
            </div>
          )}
        </aside>

        {/* Center Panel - Sheet Music Viewer */}
        <section className={styles.sheetMusicPanel}>
          <SheetMusicViewer
            url={currentSheetMusic?.url || null}
            title={currentSheetMusic?.title}
          />
        </section>

        {/* Right Panel - Playlists */}
        <section className={styles.content}>
          <div className={styles.sectionHeader}>
            <h2>Playlists</h2>
            <span className={styles.count}>{playlists.length} playlists</span>
            <button 
              className={styles.refreshBtn} 
              onClick={handleRefreshPlaylists}
              disabled={isLoadingPlaylists}
              title="Refresh playlists"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className={isLoadingPlaylists ? styles.spinning : ''}>
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </button>
          </div>

          {loadError && (
            <div className={styles.error}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              {loadError}
              <button className={styles.retryBtn} onClick={handleRefreshPlaylists}>
                Retry
              </button>
            </div>
          )}

          {connectionError && (
            <div className={styles.error}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              Connection Error: {connectionError}
            </div>
          )}

          {isLoadingPlaylists ? (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>Loading playlists...</span>
            </div>
          ) : playlists.length === 0 && !loadError ? (
            <div className={styles.empty}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
              </svg>
              <h3>No playlists yet</h3>
              <p>Create a playlist in the backoffice to get started</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {playlists.map((playlist) => (
                <PlaylistCard
                  key={playlist.uid}
                  playlist={playlist}
                  isActive={selectedPlaylist?.uid === playlist.uid}
                  playbackState={playbackState}
                  onSelect={handleSelectPlaylist}
                  onPlayTrack={handlePlayTrack}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Connection Status Bar */}
      <footer className={styles.footer}>
        <div className={`${styles.connectionStatus} ${isConnected ? styles.connected : ''}`}>
          <span className={styles.dot} />
          {isConnecting 
            ? 'Connecting to server...' 
            : isConnected 
              ? 'Connected to playback server' 
              : 'Disconnected'}
        </div>
        {!isConnected && !isConnecting && (
          <button className={styles.reconnectBtn} onClick={connect}>
            Reconnect
          </button>
        )}
      </footer>
    </div>
  );
}
