'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePlayback } from '../lib/usePlayback';
import { fetchMusicApi } from '../lib/useApi';
import { PlaybackStatus, PlaylistItemType, PlaylistTrackSummary, PresentationType } from '../lib/types';
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

function getItemLabel(item: { type: string; music?: { title?: string }; performer?: string; moderation_text?: { author?: string; text?: string } } | undefined): string {
  if (!item) return '';
  if (item.type === PlaylistItemType.TRACK) return item.music?.title ?? '';
  if (item.type === PlaylistItemType.MODERATION_TEXT) {
    if (item.moderation_text?.text?.trim().toLowerCase() === 'pause') return '☕ Pause';
    return `Moderation: ${item.performer ?? ''}`;
  }
  return '';
}

export default function ConductorPage() {
  const {
    isConnected, isLoading, playbackState, metronomeState,
    scheduledLocalStartTime,
    connect, play, stop, next, previous, setDisplayLock,
  } = usePlayback();

  const now = useClock();
  const [localTrackDetails, setLocalTrackDetails] = useState<PlaylistTrackSummary | null>(null);
  const [aCapellaMetronomeStartTime, setACapellaMetronomeStartTime] = useState<number | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const CORRECT_PIN = process.env.NEXT_PUBLIC_CONDUCTOR_PIN ?? '1234';

  function handleNumpadDigit(d: string) {
    if (pinInput.length >= CORRECT_PIN.length) return;
    const next = pinInput + d;
    setPinInput(next);
    setPinError(false);
    if (next.length === CORRECT_PIN.length) {
      if (next === CORRECT_PIN) {
        setDisplayLock(false);
        setPinInput('');
      } else {
        setPinError(true);
        setTimeout(() => { setPinInput(''); setPinError(false); }, 700);
      }
    }
  }

  function handleNumpadDelete() {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(false);
  }

  useEffect(() => { connect(); }, [connect]);

  const activePlaylistUid = playbackState.playlistUid;
  const displayLocked = playbackState.displayLocked ?? false;

  const { status, playlistItems = [], currentItemIndex: playbackItemIndex = 0,
    currentTrackTitle, currentModerationText, currentModerationAuthor,
    sheets = [], bpm, durationMs, metronomeOffset = 0,
    timeSignature } = playbackState;

  const isPlaying = status === PlaybackStatus.PLAYING;
  const isPlaybackActive = status === PlaybackStatus.PLAYING ||
    status === PlaybackStatus.COUNT_IN ||
    status === PlaybackStatus.LOADING ||
    status === PlaybackStatus.PAUSED;

  const effectivePlaylistItems: typeof playlistItems = playlistItems;
  const currentItemIndex = playbackItemIndex;
  const currentItem = effectivePlaylistItems[currentItemIndex];
  const currentTrackFallback = currentItem?.type === PlaylistItemType.TRACK ? currentItem : undefined;
  const currentModerationFallback = currentItem?.type === PlaylistItemType.MODERATION_TEXT ? currentItem : undefined;
  const fallbackMusic = localTrackDetails ?? currentTrackFallback?.music;
  const isModeration = status === PlaybackStatus.MODERATION || currentItem?.type === PlaylistItemType.MODERATION_TEXT;
  const effectiveBpm = bpm ?? fallbackMusic?.bpm ?? 120;
  const effectiveDurationMs = durationMs ?? (fallbackMusic?.duration ? fallbackMusic.duration * 1000 : 0);
  const effectiveTimeSignature = timeSignature ?? fallbackMusic?.time_signature ?? '4/4';
  const effectiveWaveform = isModeration ? null : (playbackState.waveform ?? fallbackMusic?.waveform ?? null);
  const isACapella = !isModeration && fallbackMusic?.presentation_type === PresentationType.A_CAPELLA;
  const effectiveMetronomeStartTime = scheduledLocalStartTime !== null
    ? scheduledLocalStartTime + metronomeOffset
    : null;
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

  useEffect(() => {
    if (!isACapella) {
      setACapellaMetronomeStartTime(null);
      return;
    }

    setACapellaMetronomeStartTime(Date.now());
  }, [currentItemIndex, isACapella]);

  const goPrevious = useCallback(() => { previous(); }, [previous]);

  const goNext = useCallback(() => { next(); }, [next]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !activePlaylistUid) return;

      const key = e.key.toLowerCase();
      if (key === 'a' && currentItemIndex > 0) {
        e.preventDefault();
        goPrevious();
      } else if (key === 'l' && currentItemIndex < effectivePlaylistItems.length - 1) {
        e.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePlaylistUid, currentItemIndex, effectivePlaylistItems.length, goNext, goPrevious]);

  const displayModerationText = currentModerationText ?? currentModerationFallback?.moderation_text?.text;
  const isPauseModeration = isModeration && displayModerationText?.trim().toLowerCase() === 'pause';

  // Sequential item number with the Pause rule (numbering restarts after a pause; pause has no number).
  let numberCounter = 0;
  const itemNumbers = effectivePlaylistItems.map((it) => {
    const pause = it?.type === PlaylistItemType.MODERATION_TEXT
      && it.moderation_text?.text?.trim().toLowerCase() === 'pause';
    if (pause) { numberCounter = 0; return null; }
    numberCounter += 1;
    return numberCounter;
  });
  const currentNumber = itemNumbers[currentItemIndex];
  const numberPrefix = currentNumber != null ? `${currentNumber}. ` : '';

  const displayTitle = isModeration
    ? (isPauseModeration ? '☕ Pause' : `${numberPrefix}Moderation: ${currentModerationAuthor ?? currentModerationFallback?.performer ?? ''}`)
    : `${numberPrefix}${currentTrackTitle ?? fallbackMusic?.title ?? '–'}`;
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

  if (!activePlaylistUid) {
    return (
      <div className={styles.waitingScreen}>
        <div className={styles.waitingHint}>Warte auf das Mischpult...</div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {displayLocked && (
        <div className={styles.lockOverlay}>
          <div className={styles.pinCard}>
            <div className={styles.pinTitle}>🔒 Gesperrt</div>
            <div className={`${styles.pinDots} ${pinError ? styles.pinDotsError : ''}`}>
              {Array.from({ length: CORRECT_PIN.length }, (_, i) => (
                <span key={i} className={`${styles.pinDot} ${i < pinInput.length ? styles.pinDotFilled : ''}`} />
              ))}
            </div>
            {pinError && <div className={styles.pinError}>Falscher PIN</div>}
            <div className={styles.numpad}>
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button key={d} className={styles.numpadBtn} onClick={() => handleNumpadDigit(d)}>{d}</button>
              ))}
              <button className={`${styles.numpadBtn} ${styles.numpadBtnDelete}`} onClick={handleNumpadDelete}>⌫</button>
              <button className={styles.numpadBtn} onClick={() => handleNumpadDigit('0')}>0</button>
              <div />
            </div>
          </div>
        </div>
      )}

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
            <div className={styles.moderationText}>{displayModerationText}</div>
          </div>
        ) : (
          <ConductorSheetViewer sheets={effectiveSheets} />
        )}
      </main>

      {!isACapella && !isModeration && (
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
            waveformData={effectiveWaveform}
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
      )}

      {/* Footer: BPM, beat indicator, clock */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <button className={styles.lockBtn} onClick={() => setDisplayLock(true)} title="Ansicht sperren">
            🔒
          </button>
          {!isModeration && (
            <div className={styles.bpm}>
              <span className={styles.bpmValue}>{effectiveBpm}</span>
              <span className={styles.bpmLabel}>BPM</span>
            </div>
          )}
        </div>

        {!isModeration && (
          <div className={styles.metronomeWrapper}>
            <BeatDots
              bpm={effectiveBpm}
              enabled={isACapella || (metronomeState.enabled && isPlaying)}
              timeSignature={effectiveTimeSignature}
              startTime={isACapella ? aCapellaMetronomeStartTime : (isPlaying ? effectiveMetronomeStartTime : null)}
            />
          </div>
        )}

        <div className={styles.clock}>
          {playbackState.performanceStartTime && (
            <span className={styles.elapsed} suppressHydrationWarning>
              Laufzeit: {formatElapsed(playbackState.performanceStartTime, now)}
            </span>
          )}
          <span className={styles.clockTime} suppressHydrationWarning>{formatClock(now)}</span>
        </div>
      </footer>
    </div>
  );
}
