'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePlayback } from '../lib/usePlayback';
import { fetchMusicApi, fetchPlaylistsApi } from '../lib/useApi';
import { Playlist, PlaybackStatus, PlaylistItemType, PlaylistTrackSummary } from '../lib/types';
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
  const [playlistFetchState, setPlaylistFetchState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [playlistFetchError, setPlaylistFetchError] = useState<string | null>(null);
  const [localItemIndex, setLocalItemIndex] = useState(0);
  const [localTrackDetails, setLocalTrackDetails] = useState<PlaylistTrackSummary | null>(null);

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    if (isConnected && !playbackState.playlistUid && !selectedPlaylistUid) {
      setShowPicker(true);
      setPlaylistFetchState('loading');
      setPlaylistFetchError(null);
      fetchPlaylistsApi()
        .then((items) => {
          setPlaylists(items);
          setPlaylistFetchState('loaded');
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(err);
          setPlaylistFetchError(message);
          setPlaylistFetchState('error');
        });
    }
    if (playbackState.playlistUid || selectedPlaylistUid) setShowPicker(false);
  }, [isConnected, playbackState.playlistUid, selectedPlaylistUid]);

  const selectPlaylist = useCallback((uid: string) => {
    setSelectedPlaylistUid(uid);
    const playlist = playlists.find((item) => item.uid === uid);
    const firstTrackIndex = playlist?.items.findIndex((item) => item.type === PlaylistItemType.TRACK) ?? 0;
    setLocalItemIndex(firstTrackIndex >= 0 ? firstTrackIndex : 0);
    loadPlaylist(uid);
    setShowPicker(false);
  }, [loadPlaylist, playlists]);

  const activePlaylistUid = playbackState.playlistUid ?? selectedPlaylistUid;

  const { status, playlistItems = [], currentItemIndex: playbackItemIndex = 0,
    currentTrackTitle, currentModerationText, currentModerationAuthor,
    sheets = [], audioUrl, bpm, durationMs,
    timeSignature } = playbackState;

  const isPlaying = status === PlaybackStatus.PLAYING;
  const isPlaybackActive = status === PlaybackStatus.PLAYING ||
    status === PlaybackStatus.COUNT_IN ||
    status === PlaybackStatus.LOADING ||
    status === PlaybackStatus.PAUSED;

  // Fall back to local playlist data for display and navigation before backend responds
  const localPlaylist = selectedPlaylistUid ? playlists.find(p => p.uid === selectedPlaylistUid) : null;
  const localFirstTrack = localPlaylist?.items?.find(i => i.type === PlaylistItemType.TRACK);
  const effectivePlaylistItems: typeof playlistItems =
    playlistItems.length > 0 ? playlistItems : (localPlaylist?.items ?? []);
  const useLocalBrowseIndex = !!selectedPlaylistUid && !isPlaybackActive;
  const currentItemIndex = useLocalBrowseIndex ? localItemIndex : playbackItemIndex;
  const currentItem = effectivePlaylistItems[currentItemIndex];
  const currentTrackFallback = currentItem?.type === PlaylistItemType.TRACK ? currentItem : localFirstTrack;
  const currentModerationFallback = currentItem?.type === PlaylistItemType.MODERATION_TEXT ? currentItem : undefined;
  const fallbackMusic = currentItem?.type === PlaylistItemType.TRACK
    ? (localTrackDetails ?? currentTrackFallback?.music)
    : currentTrackFallback?.music;
  const isModeration = status === PlaybackStatus.MODERATION || currentItem?.type === PlaylistItemType.MODERATION_TEXT;
  const effectiveBpm = bpm ?? fallbackMusic?.bpm ?? 120;
  const effectiveDurationMs = durationMs ?? (fallbackMusic?.duration ? fallbackMusic.duration * 1000 : 0);
  const effectiveTimeSignature = timeSignature ?? fallbackMusic?.time_signature ?? '4/4';
  const effectiveAudioUrl = isModeration ? null : (audioUrl ?? fallbackMusic?.file_url ?? null);
  const effectiveTrackIndex = currentItem?.type === PlaylistItemType.TRACK
    ? effectivePlaylistItems.slice(0, currentItemIndex + 1).filter((item) => item.type === PlaylistItemType.TRACK).length - 1
    : playbackState.currentTrackIndex ?? 0;

  useEffect(() => {
    const musicUid = currentItem?.type === PlaylistItemType.TRACK ? currentItem.music_uid : null;
    if (!musicUid) {
      setLocalTrackDetails(null);
      return;
    }

    let cancelled = false;
    setLocalTrackDetails(null);
    fetchMusicApi(musicUid)
      .then((music) => {
        if (!cancelled) setLocalTrackDetails(music);
      })
      .catch(console.error);

    return () => { cancelled = true; };
  }, [currentItem]);

  const goPrevious = useCallback(() => {
    if (useLocalBrowseIndex) {
      setLocalItemIndex((index) => Math.max(0, index - 1));
    }
    previous();
  }, [previous, useLocalBrowseIndex]);

  const goNext = useCallback(() => {
    if (useLocalBrowseIndex) {
      setLocalItemIndex((index) => Math.min(effectivePlaylistItems.length - 1, index + 1));
    }
    next();
  }, [effectivePlaylistItems.length, next, useLocalBrowseIndex]);

  const displayTitle = isModeration
    ? `Moderation: ${currentModerationAuthor ?? currentModerationFallback?.moderation_text?.author ?? ''}`
    : (currentTrackTitle ?? fallbackMusic?.title ?? '–');
  const displayModerationAuthor = currentModerationAuthor ?? currentModerationFallback?.moderation_text?.author;
  const displayModerationText = currentModerationText ?? currentModerationFallback?.moderation_text?.text;
  const effectiveSheets = sheets.length > 0 ? sheets : (fallbackMusic?.sheets ?? []);

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
          onClick={goPrevious}
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
          onClick={goNext}
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
            <div className={styles.moderationAuthor}>{displayModerationAuthor}</div>
            <div className={styles.moderationText}>{displayModerationText}</div>
          </div>
        ) : (
          <ConductorSheetViewer sheets={effectiveSheets} />
        )}
      </main>

      {/* Controls: play, waveform, stop */}
      <div className={styles.controls}>
        <button
          className={styles.playBtn}
          onClick={() => activePlaylistUid && !isModeration && play(activePlaylistUid, effectiveTrackIndex, 0)}
          disabled={isPlaybackActive || isModeration || !activePlaylistUid}
          title="Play"
        >
          ▶
        </button>

        <WaveformProgressBar
          audioUrl={effectiveAudioUrl}
          durationMs={effectiveDurationMs}
          scheduledLocalStartTime={scheduledLocalStartTime}
          positionMs={playbackState.positionMs}
          isPlaying={isPlaying}
          onSeek={undefined}
        />

        <button
          className={styles.stopBtn}
          onClick={stop}
          disabled={!isPlaybackActive}
          title="Stop"
        >
          ⏹
        </button>
      </div>

      {/* Footer: BPM, beat indicator, clock */}
      <footer className={styles.footer}>
        <div className={styles.bpm}>
          <span className={styles.bpmValue}>{effectiveBpm}</span>
          <span className={styles.bpmLabel}>BPM</span>
        </div>

        <div className={styles.metronomeWrapper}>
          <BeatDots
            bpm={effectiveBpm}
            enabled={metronomeState.enabled && isPlaying}
            timeSignature={effectiveTimeSignature}
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
              {playlistFetchState === 'loading' && playlists.length === 0 && (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
                  Playlists werden geladen...
                </div>
              )}
              {playlistFetchState === 'error' && playlists.length === 0 && (
                <div style={{ color: '#fca5a5', textAlign: 'center', padding: '20px' }}>
                  Playlists konnten nicht geladen werden: {playlistFetchError}
                </div>
              )}
              {playlistFetchState === 'loaded' && playlists.length === 0 && (
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
