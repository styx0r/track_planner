'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayback } from '../lib/usePlayback';
import { PlaylistItemType } from '../lib/types';
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

function formatDuration(ms: number | undefined) {
  if (!ms) return '';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function MixingDeskPage() {
  const {
    isConnected, isLoading, playbackState, performanceStartTime,
    connect, startPerformance,
  } = usePlayback();

  const now = useClock();
  const currentRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [playbackState.currentItemIndex]);

  const { playlistItems = [], currentItemIndex = -1 } = playbackState;
  const performanceRunning = performanceStartTime !== null;

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
            onClick={performanceRunning ? undefined : startPerformance}
          >
            {performanceRunning ? '● Performance läuft' : '▶ Start Performance'}
          </button>
        </div>

        <div className={styles.rightInfo}>
          {performanceRunning ? (
            <>
              <span className={styles.elapsed}>seit</span>
              <span className={styles.elapsedValue}>{formatElapsed(performanceStartTime!, now)}</span>
            </>
          ) : (
            <span className={styles.elapsed}>–</span>
          )}
        </div>
      </div>

      {/* Tracklist */}
      <div className={styles.list}>
        {playlistItems.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#334155' }}>
            Keine Playlist geladen
          </div>
        )}

        {playlistItems.map((item, idx) => {
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
            ? formatDuration(item.music ? undefined : undefined)
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
    </div>
  );
}
