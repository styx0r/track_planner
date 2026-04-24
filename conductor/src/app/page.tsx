'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePlayback } from '../lib/usePlayback';
import { fetchPlaylistsApi } from '../lib/useApi';
import { Playlist, PlaybackStatus, PlaylistItemType } from '../lib/types';
import { ConductorSheetViewer } from '../components/ConductorSheetViewer';
import { WaveformProgressBar } from '../components/WaveformProgressBar';
import styles from './page.module.css';

function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatElapsed(startTs: number, now: number) {
  const s = Math.max(0, Math.floor((now - startTs) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function BeatDots({ bpm, enabled, timeSignature, startTime }: {
  bpm: number; enabled: boolean; timeSignature: string; startTime: number | null;
}) {
  const beats = parseInt(timeSignature.split('/')[0], 10) || 4;
  const [activeBeat, setActiveBeat] = useState(-1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!enabled || startTime === null) { setActiveBeat(-1); return; }
    const interval = 60000 / bpm;
    const tick = () => {
      const elapsed = Date.now() - startTime;
      setActiveBeat(elapsed >= 0 ? Math.floor(elapsed / interval) % beats : -1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [enabled, startTime, bpm, beats]);

  return (
    <div className={styles.beatDots}>
      {Array.from({ length: beats }, (_, i) => (
        <div
          key={i}
          className={`${styles.beatDot} ${i === 0 ? styles.beatAccent : ''} ${i === activeBeat ? styles.beatActive : ''}`}
        />
      ))}
    </div>
  );
}

function getItemLabel(item: { type: string; music?: { title?: string }; moderation_text?: { author?: string } } | undefined): string {
  if (!item) return '';
  if (item.type === PlaylistItemType.TRACK) return item.music?.title ?? '';
  if (item.type === PlaylistItemType.MODERATION_TEXT) return `Moderation: ${item.moderation_text?.author ?? ''}`;
  return '';
}

export default function ConductorPage() {
  const {
    isConnected, isLoading, playbackState, metronomeState,
    scheduledLocalStartTime,
    connect, play, stop, next, previous, loadPlaylist,
  } = usePlayback();

  const now = useClock();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedPlaylistUid, setSelectedPlaylistUid] = useState<string | null>(null);

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    if (isConnected && !playbackState.playlistUid && !selectedPlaylistUid) {
      fetchPlaylistsApi().then(setPlaylists).catch(console.error);
      setShowPicker(true);
    }
    if (playbackState.playlistUid || selectedPlaylistUid) setShowPicker(false);
  }, [isConnected, playbackState.playlistUid, selectedPlaylistUid]);

  const selectPlaylist = useCallback((uid: string) => {
    setSelectedPlaylistUid(uid);
    loadPlaylist(uid);
    setShowPicker(false);
  }, [loadPlaylist]);

  const activePlaylistUid = playbackState.playlistUid ?? selectedPlaylistUid;

  const { status, playlistItems = [], currentItemIndex = 0,
    currentTrackTitle, currentModerationText, currentModerationAuthor,
    sheets = [], audioUrl, bpm = 120, durationMs,
    timeSignature = '4/4' } = playbackState;

  const isModeration = status === PlaybackStatus.MODERATION;
  const isPlaying = status === PlaybackStatus.PLAYING;

  // Fall back to local playlist data for display and navigation before backend responds
  const localPlaylist = selectedPlaylistUid ? playlists.find(p => p.uid === selectedPlaylistUid) : null;
  const localFirstTrack = localPlaylist?.items?.find(i => i.type === PlaylistItemType.TRACK);
  const effectivePlaylistItems: typeof playlistItems =
    playlistItems.length > 0 ? playlistItems : (localPlaylist?.items ?? []);

  const displayTitle = isModeration
    ? `Moderation: ${currentModerationAuthor ?? ''}`
    : (currentTrackTitle ?? localFirstTrack?.music?.title ?? '–');
  const effectiveSheets = sheets.length > 0 ? sheets : (localFirstTrack?.music?.sheets ?? []);

  const prevItem = effectivePlaylistItems[currentItemIndex - 1];
  const nextItem = effectivePlaylistItems[currentItemIndex + 1];


  if (!isConnected && isLoading) {
    return (
      <div className={styles.connecting}>
        <div className={styles.spinner} />
        Verbinde...
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* Header: prev / current / next */}
      <header className={styles.header}>
        <button
          className={styles.navBtn}
          onClick={previous}
          disabled={currentItemIndex === 0 || !activePlaylistUid}
          title="Vorheriges"
        >
          ← <span className={styles.navLabel}>{getItemLabel(prevItem)}</span>
        </button>

        <div className={`${styles.currentTitle} ${isModeration ? styles.moderationBadge : ''}`}>
          {displayTitle}
        </div>

        <button
          className={`${styles.navBtn} ${styles.navBtnRight}`}
          onClick={next}
          disabled={!activePlaylistUid || currentItemIndex >= effectivePlaylistItems.length - 1}
          title="Nächstes"
        >
          <span className={styles.navLabel}>{getItemLabel(nextItem)}</span> →
        </button>
      </header>

      {/* Main content */}
      <main className={styles.main}>
        {isModeration ? (
          <div className={styles.moderationContent}>
            <div className={styles.moderationAuthor}>{currentModerationAuthor}</div>
            <div className={styles.moderationText}>{currentModerationText}</div>
          </div>
        ) : (
          <ConductorSheetViewer sheets={effectiveSheets} />
        )}
      </main>

      {/* Controls: play, waveform, stop */}
      <div className={styles.controls}>
        <button
          className={styles.playBtn}
          onClick={() => activePlaylistUid && !isModeration && play(activePlaylistUid, playbackState.currentTrackIndex ?? 0, 0)}
          disabled={isPlaying || isModeration || !activePlaylistUid}
          title="Play"
        >
          ▶
        </button>

        <WaveformProgressBar
          audioUrl={audioUrl ?? null}
          durationMs={durationMs ?? 0}
          scheduledLocalStartTime={scheduledLocalStartTime}
          positionMs={playbackState.positionMs}
          isPlaying={isPlaying}
          onSeek={undefined}
        />

        <button
          className={styles.stopBtn}
          onClick={stop}
          disabled={!isPlaying}
          title="Stop"
        >
          ⏹
        </button>
      </div>

      {/* Footer: BPM, beat indicator, clock */}
      <footer className={styles.footer}>
        <div className={styles.bpm}>
          <span className={styles.bpmValue}>{bpm}</span>
          <span className={styles.bpmLabel}>BPM</span>
        </div>

        <div className={styles.metronomeWrapper}>
          <BeatDots
            bpm={bpm}
            enabled={metronomeState.enabled && isPlaying}
            timeSignature={timeSignature}
            startTime={isPlaying ? scheduledLocalStartTime : null}
          />
        </div>

        <div className={styles.clock}>
          <span className={styles.clockTime} suppressHydrationWarning>{formatClock(now)}</span>
          {playbackState.performanceStartTime && (
            <span className={styles.elapsed} suppressHydrationWarning>seit {formatElapsed(playbackState.performanceStartTime, now)}</span>
          )}
        </div>
      </footer>

      {/* Playlist picker overlay */}
      {showPicker && (
        <div className={styles.overlay}>
          <div className={styles.picker}>
            <div className={styles.pickerTitle}>Playlist auswählen</div>
            <div className={styles.pickerList}>
              {playlists.map(p => (
                <button key={p.uid} className={styles.pickerItem} onClick={() => selectPlaylist(p.uid)}>
                  {p.name}
                  {p.description && <> — <small>{p.description}</small></>}
                </button>
              ))}
              {playlists.length === 0 && (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
                  Keine Playlists vorhanden
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
