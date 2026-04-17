'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlayback } from '../lib/usePlayback';
import { fetchPlaylistsApi } from '../lib/useApi';
import { Playlist } from '../lib/types';
import { Player } from './Player';
import { Metronome } from './Metronome';
import { PlaylistCard } from './PlaylistCard';
import { SheetMusicViewer } from './SheetMusicViewer';
import styles from '../app/playlists/page.module.css';

type AppMode = 'performance' | 'rehearsal';

interface PlaylistsViewProps {
  initialMode: AppMode;
}

export function PlaylistsView({ initialMode }: PlaylistsViewProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<AppMode>(initialMode);
  const isPerformanceMode = mode === 'performance';

  const [countInBeats, setCountInBeats] = useState(4);
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
    resume,
    seek,
    stop,
    next,
    previous,
    toggleMetronome,
    setMetronomeBpm,
    setCountIn,
  } = usePlayback();

  useEffect(() => {
    let mounted = true;
    const loadPlaylists = async () => {
      try {
        setIsLoadingPlaylists(true);
        setLoadError(null);
        const data = await fetchPlaylistsApi();
        if (mounted) setPlaylists(data);
      } catch (err) {
        if (mounted) setLoadError(err instanceof Error ? err.message : 'Failed to load playlists');
      } finally {
        if (mounted) setIsLoadingPlaylists(false);
      }
    };
    loadPlaylists();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  const handleSelectPlaylist = useCallback((playlist: Playlist) => {
    setSelectedPlaylist(playlist);
  }, []);

  const effectiveCountInBeats = isPerformanceMode ? 0 : countInBeats;

  const handlePlayTrack = useCallback((playlistUid: string, trackIndex: number) => {
    const playlist = playlists.find(p => p.uid === playlistUid);
    if (playlist) setSelectedPlaylist(playlist);
    play(playlistUid, trackIndex, effectiveCountInBeats);
  }, [playlists, play, effectiveCountInBeats]);

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

  const currentSheetMusic = useMemo(() => {
    const stateSheet = playbackState.sheets?.[0];
    if (stateSheet) {
      return { url: stateSheet.url, title: playbackState.currentTrackTitle || 'Sheet Music' };
    }
    if (selectedPlaylist && playbackState.currentTrackIndex !== undefined) {
      const trackItems = selectedPlaylist.items.filter(i => i.type === 'TRACK');
      const track = trackItems[playbackState.currentTrackIndex];
      const firstSheet = track?.music?.sheets?.[0];
      if (firstSheet) return { url: firstSheet.url, title: track.music?.title || 'Sheet Music' };
    }
    return null;
  }, [playbackState.sheets, playbackState.currentTrackTitle, playbackState.currentTrackIndex, selectedPlaylist]);

  return (
    <div className={`${styles.page} ${isPerformanceMode ? styles.performanceMode : ''}`}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Track Planner</h1>
          <p className={styles.subtitle}>
            {isPerformanceMode ? 'Performance Mode' : 'Rehearsal Mode'}
          </p>
        </div>

        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${mode === 'rehearsal' ? styles.active : ''}`}
            onClick={() => setMode('rehearsal')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
            <span>Rehearsal</span>
          </button>
          <button
            className={`${styles.modeBtn} ${mode === 'performance' ? styles.active : ''}`}
            onClick={() => setMode('performance')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
            <span>Performance</span>
          </button>
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

      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <Player
            playbackState={playbackState}
            activePlaylist={selectedPlaylist}
            isConnected={isConnected}
            countInBeats={countInBeats}
            scheduledLocalStartTime={scheduledLocalStartTime}
            performanceMode={isPerformanceMode}
            onSeek={seek}
            onPlay={(uid, idx) => play(uid, idx, effectiveCountInBeats)}
            onPause={pause}
            onResume={resume}
            onStop={stop}
            onNext={next}
            onPrevious={previous}
            onCountInChange={handleCountInChange}
          />

          <Metronome
            enabled={metronomeState.enabled && (
              playbackState.status === 'playing' ||
              playbackState.status === 'count_in'
            )}
            bpm={playbackState.bpm || metronomeState.bpm}
            startTime={scheduledLocalStartTime}
            countInStartTime={isPerformanceMode ? null : countInStartTime}
            countInBeats={effectiveCountInBeats}
            metronomeOffset={playbackState.metronomeOffset ?? manualMetronomeOffset}
            timeSignature={playbackState.timeSignature || '4/4'}
            performanceMode={isPerformanceMode}
            onToggle={toggleMetronome}
            onBpmChange={setMetronomeBpm}
            onOffsetChange={setManualMetronomeOffset}
          />

          {!isPerformanceMode && syncResult && (
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

        <section className={styles.sheetMusicPanel}>
          <SheetMusicViewer
            url={currentSheetMusic?.url || null}
            title={currentSheetMusic?.title}
          />
        </section>

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
              <button className={styles.retryBtn} onClick={handleRefreshPlaylists}>Retry</button>
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
                  onPause={pause}
                />
              ))}
            </div>
          )}
        </section>
      </main>

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
