'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePlayback } from '../lib/usePlayback';
import { fetchPlaylistsApi } from '../lib/useApi';
import { Playlist, PlaybackStatus, PlaylistItemType } from '../lib/types';
import { SheetMusicViewer } from '../components/SheetMusicViewer';
import { WaveformProgressBar } from '../components/WaveformProgressBar';
import { Metronome } from '../components/Metronome';
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

function getItemLabel(item: { type: string; music?: { title?: string }; moderation_text?: { author?: string } } | undefined): string {
  if (!item) return '';
  if (item.type === PlaylistItemType.TRACK) return item.music?.title ?? '';
  if (item.type === PlaylistItemType.MODERATION_TEXT) return `Moderation: ${item.moderation_text?.author ?? ''}`;
  return '';
}

export default function ConductorPage() {
  const {
    isConnected, isLoading, playbackState, metronomeState,
    scheduledLocalStartTime, countInStartTime, performanceStartTime,
    connect, play, pause, resume, stop, next, previous, toggleMetronome, setMetronomeBpm,
  } = usePlayback();

  const now = useClock();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    if (isConnected && !playbackState.playlistUid) {
      fetchPlaylistsApi().then(setPlaylists).catch(console.error);
      setShowPicker(true);
    }
    if (playbackState.playlistUid) setShowPicker(false);
  }, [isConnected, playbackState.playlistUid]);

  const selectPlaylist = useCallback((uid: string) => {
    play(uid, 0, 0);
    setShowPicker(false);
  }, [play]);

  const { status, playlistItems = [], currentItemIndex = 0,
    currentTrackTitle, currentModerationText, currentModerationAuthor,
    sheets = [], audioUrl, bpm = 120, durationMs,
    metronomeOffset = 0, timeSignature = '4/4' } = playbackState;

  const isModeration = status === PlaybackStatus.MODERATION;
  const isPlaying = status === PlaybackStatus.PLAYING;
  const isPaused = status === PlaybackStatus.PAUSED;
  const isActive = isPlaying || isPaused;

  const prevItem = playlistItems[currentItemIndex - 1];
  const nextItem = playlistItems[currentItemIndex + 1];

  const sheetUrl = sheets.length > 0 ? sheets[0].url : null;
  const currentDisplayTitle = isModeration
    ? `Moderation: ${currentModerationAuthor ?? ''}`
    : (currentTrackTitle ?? '–');

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
          disabled={currentItemIndex === 0 || !playbackState.playlistUid}
          title="Vorheriges"
        >
          ← <span className={styles.navLabel}>{getItemLabel(prevItem)}</span>
        </button>

        <div className={`${styles.currentTitle} ${isModeration ? styles.moderationBadge : ''}`}>
          {currentDisplayTitle}
        </div>

        <button
          className={`${styles.navBtn} ${styles.navBtnRight}`}
          onClick={next}
          disabled={currentItemIndex >= playlistItems.length - 1 && !playbackState.playlistUid}
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
          <SheetMusicViewer url={sheetUrl} title={currentTrackTitle} />
        )}
      </main>

      {/* Controls: play, waveform, stop */}
      <div className={styles.controls}>
        {isPlaying ? (
          <button className={`${styles.playBtn} ${styles.pauseBtn}`} onClick={pause} title="Pause">
            ⏸
          </button>
        ) : (
          <button
            className={styles.playBtn}
            onClick={() => isPaused ? resume() : (playbackState.playlistUid && !isModeration && play(playbackState.playlistUid, playbackState.currentTrackIndex ?? 0, 0))}
            disabled={isModeration || !playbackState.playlistUid}
            title="Play"
          >
            ▶
          </button>
        )}

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
          disabled={!isActive}
          title="Stop"
        >
          ⏹
        </button>
      </div>

      {/* Footer: BPM, metronome, clock */}
      <footer className={styles.footer}>
        <div className={styles.bpm}>BPM {bpm}</div>

        <div className={styles.metronomeWrapper}>
          <Metronome
            enabled={metronomeState.enabled}
            bpm={bpm}
            startTime={scheduledLocalStartTime}
            countInStartTime={countInStartTime}
            countInBeats={playbackState.countInBeats ?? 0}
            metronomeOffset={metronomeOffset}
            timeSignature={timeSignature}
            performanceMode={true}
            onToggle={toggleMetronome}
            onBpmChange={setMetronomeBpm}
            onOffsetChange={() => {}}
          />
        </div>

        <div className={styles.clock}>
          <span className={styles.clockTime}>{formatClock(now)}</span>
          {performanceStartTime && (
            <span className={styles.elapsed}>seit {formatElapsed(performanceStartTime, now)}</span>
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
