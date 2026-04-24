'use client';

import { useEffect, useState } from 'react';
import { usePlayback } from '../lib/usePlayback';
import { PlaylistItem, PlaylistItemType } from '../lib/types';
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
    ? `seit ${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `seit ${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function findNextModeration(items: PlaylistItem[], currentIndex: number) {
  for (let i = currentIndex + 1; i < items.length; i++) {
    if (items[i].type === PlaylistItemType.MODERATION_TEXT) return items[i];
  }
  return null;
}

function songsSinceLastModeration(items: PlaylistItem[], currentIndex: number): string[] {
  const titles: string[] = [];
  for (let i = currentIndex; i >= 0; i--) {
    if (!items[i]) break;
    if (items[i].type === PlaylistItemType.MODERATION_TEXT) break;
    if (items[i].type === PlaylistItemType.TRACK) titles.unshift(items[i].music?.title ?? '?');
  }
  return titles;
}

function nextSongsAfterModeration(items: PlaylistItem[], moderationItem: PlaylistItem): string[] {
  const modIdx = items.indexOf(moderationItem);
  const songs: string[] = [];
  for (let i = modIdx + 1; i < items.length && songs.length < 3; i++) {
    if (items[i].type === PlaylistItemType.TRACK) songs.push(items[i].music?.title ?? '?');
    if (items[i].type === PlaylistItemType.MODERATION_TEXT) break;
  }
  return songs;
}

export default function ModeratorPage() {
  const { isConnected, isLoading, playbackState, performanceStartTime, connect } = usePlayback();
  const now = useClock();

  useEffect(() => { connect(); }, [connect]);

  const { playlistItems = [], currentItemIndex = 0, currentModerationText, currentModerationAuthor } = playbackState;

  // When currently on a moderation item, show that. Otherwise look ahead for next moderation.
  const isCurrentlyModeration = playbackState.status === 'moderation';
  const nextMod = isCurrentlyModeration ? null : findNextModeration(playlistItems, currentItemIndex);

  const displayModerationText = isCurrentlyModeration ? currentModerationText : nextMod?.moderation_text?.text;
  const displayModerationAuthor = isCurrentlyModeration ? currentModerationAuthor : nextMod?.moderation_text?.author;

  const recentSongs = songsSinceLastModeration(playlistItems, currentItemIndex);
  const upcomingSongs = nextMod ? nextSongsAfterModeration(playlistItems, nextMod) : [];

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
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerCell}>
          <span className={styles.headerLabel}>Lieder seit letzter Moderation</span>
          <div className={styles.songList}>
            {recentSongs.length > 0
              ? recentSongs.map((t, i) => <span key={i} className={styles.songItem}>{t}</span>)
              : <span className={styles.songItem}>–</span>}
          </div>
        </div>

        <div className={`${styles.headerCell} ${styles.center}`}>
          <span className={styles.headerLabel}>Moderator</span>
          <span className={`${styles.headerValue} ${styles.moderatorName}`}>
            {displayModerationAuthor ?? '–'}
          </span>
        </div>

        <div className={`${styles.headerCell} ${styles.right}`}>
          <span className={styles.headerLabel}>Nächste Lieder</span>
          <div className={styles.songList}>
            {upcomingSongs.length > 0
              ? upcomingSongs.map((t, i) => <span key={i} className={styles.songItem}>{t}</span>)
              : <span className={styles.songItem}>–</span>}
          </div>
        </div>
      </header>

      {/* Main: moderation text */}
      <main className={styles.main}>
        {!playbackState.playlistUid ? (
          <div className={styles.idleHint}>Warte auf das Mischpult...</div>
        ) : displayModerationText ? (
          <>
            {!isCurrentlyModeration && <div className={styles.nextLabel}>Nächste Moderation</div>}
            <div className={styles.moderationText}>{displayModerationText}</div>
          </>
        ) : (
          <div className={styles.noModeration}>Keine weiteren Moderationen</div>
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>{formatClock(now)}</div>
        <div className={styles.footerRight}>
          {performanceStartTime ? formatElapsed(performanceStartTime, now) : '–'}
        </div>
      </footer>
    </div>
  );
}
