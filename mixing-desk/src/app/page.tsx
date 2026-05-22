'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayback } from '../lib/usePlayback';
import { fetchPlaylistsApi } from '../lib/useApi';
import { getLocalStartTime } from '../lib/timeSync';
import { Playlist, PlaylistItemType, PresentationType } from '../lib/types';
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

function formatPresentationType(type: PresentationType | undefined): string {
  switch (type) {
    case PresentationType.A_CAPELLA: return 'A Cappella';
    case PresentationType.LIVE_PIANO: return 'Live-Piano';
    case PresentationType.PLAYBACK: return 'Playback';
    default: return '';
  }
}


export default function MixingDeskPage() {
  const {
    isConnected, isLoading, playbackState, syncResult,
    connect, startPerformance, resetPerformance, loadPlaylist, resetProgram, setDisplayLock,
  } = usePlayback();

  const now = useClock();
  const currentRowRef = useRef<HTMLDivElement>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showPlaylistResetDialog, setShowPlaylistResetDialog] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistUid, setSelectedPlaylistUid] = useState<string | null>(null);
  const [playlistFetchState, setPlaylistFetchState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [playlistFetchError, setPlaylistFetchError] = useState<string | null>(null);

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    if (!isConnected || playlistFetchState !== 'idle') return;

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
  }, [isConnected, playlistFetchState]);

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [playbackState.currentItemIndex]);

  const { playlistItems = [], currentItemIndex = -1 } = playbackState;
  const activePlaylistUid = playbackState.playlistUid ?? selectedPlaylistUid;
  const selectedPlaylist = activePlaylistUid
    ? playlists.find((playlist) => playlist.uid === activePlaylistUid)
    : null;
  const effectivePlaylistItems = playlistItems.length > 0
    ? playlistItems
    : (selectedPlaylist?.items ?? []);
  const rawPerformanceStartTime = playbackState.performanceStartTime ?? null;
  const performanceStartTime = rawPerformanceStartTime !== null && syncResult
    ? getLocalStartTime(rawPerformanceStartTime, syncResult.offset)
    : rawPerformanceStartTime;
  const displayLocked = playbackState.displayLocked ?? false;
  const performanceRunning = performanceStartTime !== null;

  const selectPlaylist = useCallback((uid: string) => {
    setSelectedPlaylistUid(uid);
    loadPlaylist(uid);
  }, [loadPlaylist]);

  function handleCenterClick() {
    if (performanceRunning) setShowResetDialog(true);
    else startPerformance();
  }

  function confirmReset() {
    resetPerformance();
    setShowResetDialog(false);
  }

  function confirmPlaylistReset() {
    setSelectedPlaylistUid(null);
    resetProgram();
    setShowPlaylistResetDialog(false);
  }

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
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.clock}>{formatClock(now)}</div>

        <div className={styles.startArea}>
          <button
            className={`${styles.startBtn} ${performanceRunning ? styles.startBtnActive : ''}`}
            onClick={handleCenterClick}
          >
            {performanceRunning ? '● Performance läuft' : '▶ Start Performance'}
          </button>
          {performanceRunning ? (
            <>
              <span className={styles.elapsed}>seit <span className={styles.elapsedValue}>{formatElapsed(performanceStartTime!, now)}</span></span>
              <span className={styles.resetHint}>klicken zum Zurücksetzen</span>
            </>
          ) : null}
        </div>

        <div className={styles.rightInfo}>
          <button
            className={`${styles.lockBtn} ${displayLocked ? styles.lockBtnActive : ''}`}
            onClick={() => setDisplayLock(!displayLocked)}
            title={displayLocked ? 'Auftrittsmodus entsperren' : 'Auftrittsmodus sperren'}
          >
            {displayLocked ? '🔒 Gesperrt' : '🔓 Sperren'}
          </button>
          {activePlaylistUid && (
            <button
              className={styles.changePlaylistBtn}
              onClick={() => setShowPlaylistResetDialog(true)}
            >
              Neue Playlist auswählen
            </button>
          )}
        </div>
      </div>

      {/* Tracklist */}
      <div className={styles.list}>
        {effectivePlaylistItems.length === 0 && (
          <div className={styles.playlistPicker}>
            <div className={styles.pickerTitle}>Programm auswählen</div>
            {playlistFetchState === 'loading' && (
              <div className={styles.pickerHint}>Playlists werden geladen...</div>
            )}
            {playlistFetchState === 'error' && (
              <div className={styles.pickerError}>Playlists konnten nicht geladen werden: {playlistFetchError}</div>
            )}
            {playlistFetchState === 'loaded' && playlists.length === 0 && (
              <div className={styles.pickerHint}>Keine Playlists vorhanden</div>
            )}
            {playlists.map((playlist) => (
              <button
                key={playlist.uid}
                className={styles.playlistButton}
                onClick={() => selectPlaylist(playlist.uid)}
              >
                <span>{playlist.name}</span>
                {playlist.description && <small>{playlist.description}</small>}
              </button>
            ))}
          </div>
        )}

        {effectivePlaylistItems.map((item, idx) => {
          const isTrack = item.type === PlaylistItemType.TRACK;
          const isMod = item.type === PlaylistItemType.MODERATION_TEXT;
          const isCurrent = idx === currentItemIndex;

          let rowClass = styles.row;
          if (isCurrent && isTrack) rowClass += ` ${styles.rowCurrent}`;
          else if (isCurrent && isMod) rowClass += ` ${styles.rowModerationCurrent}`;
          else if (isMod) rowClass += ` ${styles.rowModeration}`;

          const title = isTrack
            ? (item.music?.title ?? '?')
            : `Moderation: ${item.moderation_text?.author ?? ''}`;

          const meta = isTrack
            ? formatPresentationType(item.music?.presentation_type)
            : item.moderation_text?.category ?? '';

          return (
            <div
              key={idx}
              className={rowClass}
              ref={isCurrent ? currentRowRef : null}
            >
              <span className={styles.rowNum}>{idx + 1}</span>
              <span className={styles.rowIcon}>{isTrack ? '♪' : '🎤'}</span>
              <span className={styles.rowTitle}>{title}</span>
              <span className={styles.rowMeta}>{meta}</span>
            </div>
          );
        })}
      </div>
      {/* Reset confirmation dialog */}
      {showResetDialog && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogTitle}>Zeit zurücksetzen?</div>
            <div className={styles.dialogBody}>
              Die Performance-Zeit wird auf jetzt zurückgesetzt.<br />
              Aktuelle Zeit: <strong>{formatElapsed(performanceStartTime!, now)}</strong>
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setShowResetDialog(false)}>
                Abbrechen
              </button>
              <button className={styles.dialogConfirm} onClick={confirmReset}>
                Zurücksetzen
              </button>
            </div>
          </div>
        </div>
      )}
      {showPlaylistResetDialog && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogTitle}>Playlist neu auswählen?</div>
            <div className={styles.dialogBody}>
              Das aktuelle Programm wird für alle Ansichten zurückgesetzt.<br />
              Conductor und Moderator wechseln zurück auf <strong>Warte auf das Mischpult...</strong>.
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setShowPlaylistResetDialog(false)}>
                Abbrechen
              </button>
              <button className={styles.dialogConfirm} onClick={confirmPlaylistReset}>
                Playlist zurücksetzen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
