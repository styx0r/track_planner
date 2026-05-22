'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePlayback } from '../../lib/usePlayback';
import { fetchPlaylistsApi, fetchPlaylistApi } from '../../lib/useApi';
import {
  PlaybackStatus,
  PlaylistItemType,
  PresentationType,
  Playlist,
} from '../../lib/types';
import { SheetViewer } from '../../components/SheetViewer';
import { WaveformProgressBar } from '../../components/WaveformProgressBar';
import { initAudioContext, playMetronomeClick } from '../../lib/metronomeAudio';
import styles from './page.module.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getItemLabel(item: { type: string; music?: { title?: string }; moderation_text?: { author?: string } } | undefined): string {
  if (!item) return '';
  if (item.type === PlaylistItemType.TRACK) return item.music?.title ?? '';
  if (item.type === PlaylistItemType.MODERATION_TEXT)
    return `Mod: ${item.moderation_text?.author ?? ''}`;
  return '';
}

// ── BeatDots with optional sound ─────────────────────────────────────────────

function BeatDots({
  bpm, isActive, soundEnabled, timeSignature,
  startTime, countInStartTime, countInBeats, metronomeOffset,
}: {
  bpm: number; isActive: boolean; soundEnabled: boolean; timeSignature: string;
  startTime: number | null; countInStartTime: number | null;
  countInBeats: number; metronomeOffset: number;
}) {
  const beats = parseInt(timeSignature.split('/')[0], 10) || 4;
  const [activeBeat, setActiveBeat] = useState(-1);
  const rafRef = useRef<number | null>(null);
  const lastBeatRef = useRef(-1);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastBeatRef.current = -1;
    if (!isActive) { setActiveBeat(-1); return; }

    const interval = 60000 / bpm;
    const effectiveStart = startTime !== null ? startTime + metronomeOffset : null;

    const tick = () => {
      const now = Date.now();

      if (countInStartTime !== null && countInBeats > 0) {
        const ciElapsed = now - countInStartTime;
        if (ciElapsed >= 0 && ciElapsed < countInBeats * interval) {
          const ciBeat = Math.floor(ciElapsed / interval);
          if (ciBeat !== lastBeatRef.current) {
            lastBeatRef.current = ciBeat;
            setActiveBeat(-1);
            if (soundRef.current) {
              initAudioContext();
              playMetronomeClick('wood', ciBeat % beats === 0, 0.6, true, ciBeat % beats);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      if (effectiveStart === null) { rafRef.current = requestAnimationFrame(tick); return; }
      const elapsed = now - effectiveStart;
      if (elapsed < 0) { rafRef.current = requestAnimationFrame(tick); return; }

      const totalBeat = Math.floor(elapsed / interval);
      const beatInMeasure = totalBeat % beats;
      if (totalBeat !== lastBeatRef.current) {
        lastBeatRef.current = totalBeat;
        setActiveBeat(beatInMeasure);
        if (soundRef.current) {
          initAudioContext();
          playMetronomeClick('wood', beatInMeasure === 0, 0.5, false, beatInMeasure);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isActive, startTime, countInStartTime, countInBeats, bpm, beats, metronomeOffset]);

  return (
    <div className={styles.beatDots}>
      {Array.from({ length: beats }, (_, i) => (
        <div key={i} className={`${styles.beatDot} ${i === 0 ? styles.beatAccent : ''} ${i === activeBeat ? styles.beatActive : ''}`} />
      ))}
    </div>
  );
}

// ── Playlist picker overlay ───────────────────────────────────────────────────

function PlaylistPicker({
  playlists,
  loading,
  onPick,
}: {
  playlists: Playlist[];
  loading: boolean;
  onPick: (pl: Playlist) => void;
}) {
  return (
    <div className={styles.overlay}>
      <div className={styles.picker}>
        <div className={styles.pickerTitle}>Playlist auswählen</div>
        {loading && <div className={styles.pickerEmpty}>Lade Playlists…</div>}
        {!loading && playlists.length === 0 && (
          <div className={styles.pickerEmpty}>Keine Playlists vorhanden</div>
        )}
        <div className={styles.pickerList}>
          {playlists.map((pl) => (
            <button key={pl.uid} className={styles.pickerItem} onClick={() => onPick(pl)}>
              <span className={styles.pickerName}>{pl.name}</span>
              {pl.description && <span className={styles.pickerDesc}>{pl.description}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RehearsalPage() {
  const {
    isConnected,
    isLoading,
    playbackState,
    scheduledLocalStartTime,
    countInStartTime,
    connect,
    play,
    pause,
    resume,
    stop,
    seek,
  } = usePlayback();

  const now = useClock();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [aCapellaStartTime, setACapellaStartTime] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Local playlist state — independent of server/FOH
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [availablePlaylists, setAvailablePlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  useEffect(() => { connect(); }, [connect]);

  // Fetch playlist list whenever the picker is visible (initial load or manual open)
  const pickerVisible = !selectedPlaylist || showPicker;
  useEffect(() => {
    if (!pickerVisible) return;
    setLoadingPlaylists(true);
    fetchPlaylistsApi()
      .then((pls) => { setAvailablePlaylists(pls); setLoadingPlaylists(false); })
      .catch(() => setLoadingPlaylists(false));
  }, [pickerVisible]);

  // Fetch full playlist details on selection
  const handlePickPlaylist = useCallback((pl: Playlist) => {
    setShowPicker(false);
    // Fetch full data (items include bpm, waveform, time_signature)
    fetchPlaylistApi(pl.uid)
      .then(setSelectedPlaylist)
      .catch(() => setSelectedPlaylist(pl));
  }, []);


  // Derive state from playback
  const {
    status,
    playlistUid: serverPlaylistUid,
    currentItemIndex: serverItemIndex = 0,
    metronomeOffset = 0,
    waveform,
    audioUrl,
    sheets = [],
    bpm,
    durationMs,
    timeSignature,
  } = playbackState;

  const isPlaying = status === PlaybackStatus.PLAYING;
  const isPaused = status === PlaybackStatus.PAUSED;
  const isCountIn = status === PlaybackStatus.COUNT_IN;
  const isPlaybackActive = isPlaying || isPaused || isCountIn || status === PlaybackStatus.LOADING;

  // Active item index: use server index only when the server has our playlist loaded
  const serverMatchesLocal = selectedPlaylist !== null && serverPlaylistUid === selectedPlaylist.uid;
  const activeItemIndex = serverMatchesLocal ? serverItemIndex : -1;

  const localItems = selectedPlaylist?.items ?? [];
  const currentLocalItem = localItems[activeItemIndex] ?? null;
  const localMusic = currentLocalItem?.type === PlaylistItemType.TRACK ? currentLocalItem.music : null;

  const isModeration = currentLocalItem?.type === PlaylistItemType.MODERATION_TEXT ||
    status === PlaybackStatus.MODERATION;

  const isACapella = !isModeration && localMusic?.presentation_type === PresentationType.A_CAPELLA;

  const effectiveBpm = bpm ?? localMusic?.bpm ?? 120;
  const effectiveDurationMs = durationMs ?? (localMusic?.duration ? localMusic.duration * 1000 : 0);
  const effectiveTimeSignature = timeSignature ?? localMusic?.time_signature ?? '4/4';
  const effectiveWaveform = isModeration ? null : (waveform ?? localMusic?.waveform ?? null);
  const effectiveAudioUrl = isModeration ? null : (audioUrl ?? localMusic?.file_url ?? null);
  const effectiveSheets = sheets.length > 0 ? sheets : (localMusic?.sheets ?? []);

  const displayModerationText = playbackState.currentModerationText ?? currentLocalItem?.moderation_text?.text;
  const displayModerationAuthor = playbackState.currentModerationAuthor ?? currentLocalItem?.moderation_text?.author;

  // A Capella: start visual metronome on track change
  useEffect(() => {
    if (!isACapella) { setACapellaStartTime(null); return; }
    setACapellaStartTime(Date.now());
  }, [activeItemIndex, isACapella]);

  const metronomeStartTime = isACapella ? aCapellaStartTime : scheduledLocalStartTime;
  const metronomeIsActive = isACapella ? aCapellaStartTime !== null : (isPlaying || isCountIn);

  // Track numbers (for sidebar display)
  const trackNumbers = new Map<number, number>();
  let n = 0;
  localItems.forEach((item, idx) => {
    if (item.type === PlaylistItemType.TRACK) trackNumbers.set(idx, ++n);
  });

  // For the play button: which track index should we (re)play?
  const currentTrackIdx = (() => {
    let count = 0;
    for (let i = 0; i < activeItemIndex; i++) {
      if (localItems[i]?.type === PlaylistItemType.TRACK) count++;
    }
    if (currentLocalItem?.type === PlaylistItemType.TRACK) return count;
    return Math.max(0, count - 1);
  })();

  const handleSidebarClick = useCallback((trackIdx: number) => {
    if (!selectedPlaylist) return;
    play(selectedPlaylist.uid, trackIdx, 0);
  }, [selectedPlaylist, play]);

  const handlePlayPause = useCallback(() => {
    if (!selectedPlaylist) return;
    if (isPaused) { resume(); return; }
    if (isPlaying || isCountIn) { pause(); return; }
    if (!isModeration) play(selectedPlaylist.uid, Math.max(0, currentTrackIdx), 0);
  }, [selectedPlaylist, isPaused, isPlaying, isCountIn, isModeration, resume, pause, play, currentTrackIdx]);

  // ── Loading screen ──────────────────────────────────────────────────────────

  if (!isConnected && isLoading) {
    return (
      <div className={styles.connecting}>
        <div className={styles.spinner} />
        Verbinde…
      </div>
    );
  }

  // ── Playlist picker ─────────────────────────────────────────────────────────

  if (!selectedPlaylist || showPicker) {
    return (
      <PlaylistPicker
        playlists={availablePlaylists}
        loading={loadingPlaylists}
        onPick={handlePickPlaylist}
      />
    );
  }

  // ── Rehearsal UI ────────────────────────────────────────────────────────────

  return (
    <div className={`${styles.layout} ${sidebarOpen ? '' : styles.layoutCollapsed}`}>

      {/* ── Left sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          {sidebarOpen && (
            <span className={styles.sidebarTitle} title={selectedPlaylist.name}>
              {selectedPlaylist.name}
            </span>
          )}
          <div className={styles.sidebarHeaderBtns}>
            {sidebarOpen && (
              <button
                className={styles.changePlistBtn}
                onClick={() => setShowPicker(true)}
                title="Playlist wechseln"
              >
                ⇄
              </button>
            )}
            <button
              className={styles.collapseBtn}
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? 'Einklappen' : 'Ausklappen'}
            >
              {sidebarOpen ? '‹' : '›'}
            </button>
          </div>
        </div>

        <div className={styles.sidebarList}>
          {localItems.map((item, idx) => {
            const isActive = idx === activeItemIndex;
            const trackNum = trackNumbers.get(idx);
            const isTrack = item.type === PlaylistItemType.TRACK;
            return (
              <button
                key={idx}
                className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''} ${!isTrack ? styles.sidebarItemModeration : ''}`}
                onClick={() => isTrack ? handleSidebarClick(trackNum! - 1) : undefined}
                disabled={!isTrack}
              >
                <span className={styles.sidebarItemNum}>{isTrack ? trackNum : 'M'}</span>
                <span className={styles.sidebarItemLabel}>{getItemLabel(item)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Main: sheet music or moderation ── */}
      <main className={styles.main}>
        {isModeration ? (
          <div className={styles.moderationContent}>
            <div className={styles.moderationAuthor}>{displayModerationAuthor}</div>
            <div className={styles.moderationText}>{displayModerationText}</div>
          </div>
        ) : (
          <SheetViewer sheets={effectiveSheets} />
        )}
      </main>

      {/* ── Controls bar (hidden for A Capella, same as Auftrittsmodus) ── */}
      {!isACapella && (
        <div className={styles.controls}>
          <button
            className={`${styles.playPauseBtn} ${(isPlaying || isCountIn) ? styles.activePlay : ''}`}
            onClick={handlePlayPause}
            disabled={isModeration && !isPlaybackActive}
            title={isPaused ? 'Weiter' : (isPlaying || isCountIn) ? 'Pause' : 'Play'}
          >
            {(isPlaying || isCountIn) ? '⏸' : '▶'}
          </button>

          <WaveformProgressBar
            waveformData={effectiveWaveform}
            audioUrl={effectiveAudioUrl}
            durationMs={effectiveDurationMs}
            scheduledLocalStartTime={scheduledLocalStartTime}
            positionMs={playbackState.positionMs}
            isPlaying={isPlaying}
            onSeek={seek}
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
      )}

      {/* ── Footer: sound toggle + beat dots + BPM + clock ── */}
      <footer className={styles.footer}>
        <div className={styles.soundToggle}>
          <button
            className={`${styles.soundBtn} ${soundEnabled ? styles.soundBtnOn : ''}`}
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? 'Metronom-Klick aus' : 'Metronom-Klick an'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <span className={styles.soundLabel}>{soundEnabled ? 'Klick an' : 'Klick aus'}</span>
        </div>

        <div className={styles.metronomeWrapper}>
          <BeatDots
            bpm={effectiveBpm}
            isActive={metronomeIsActive}
            soundEnabled={soundEnabled}
            timeSignature={effectiveTimeSignature}
            startTime={metronomeStartTime}
            countInStartTime={countInStartTime}
            countInBeats={playbackState.countInBeats ?? 0}
            metronomeOffset={isACapella ? 0 : metronomeOffset}
          />
        </div>

        <div className={styles.footerRight}>
          <div className={styles.bpm}>
            <span className={styles.bpmValue}>{effectiveBpm}</span>
            <span className={styles.bpmLabel}>BPM</span>
          </div>
          <span className={styles.clockTime} suppressHydrationWarning>{formatClock(now)}</span>
        </div>
      </footer>
    </div>
  );
}
