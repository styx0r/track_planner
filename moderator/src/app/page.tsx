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
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function collectTrackTitles(items: PlaylistItem[], startIndex: number, direction: 1 | -1): string[] {
  const titles: string[] = [];

  for (let i = startIndex; i >= 0 && i < items.length; i += direction) {
    const item = items[i];
    if (!item || item.type === PlaylistItemType.MODERATION_TEXT) break;
    if (item.type === PlaylistItemType.TRACK) {
      const title = `${item.is_encore ? 'Z: ' : ''}${item.music?.title ?? '?'}`;
      if (direction === 1) titles.push(title);
      else titles.unshift(title);
    }
  }

  return titles;
}

function findPreviousModerationIndex(items: PlaylistItem[], beforeIndex: number): number {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    if (items[i].type === PlaylistItemType.MODERATION_TEXT) return i;
  }
  return -1;
}

function songsBeforeModeration(items: PlaylistItem[], moderationIndex: number): string[] {
  if (moderationIndex < 0) return ['–'];

  return collectTrackTitles(items, moderationIndex - 1, -1);
}

function songsAfterModeration(items: PlaylistItem[], moderationIndex: number): string[] {
  if (moderationIndex < 0) return [];
  return collectTrackTitles(items, moderationIndex + 1, 1);
}

function getDisplayModerationIndex(items: PlaylistItem[], currentIndex: number): number {
  if (items[currentIndex]?.type === PlaylistItemType.MODERATION_TEXT) {
    return currentIndex;
  }

  if (items[currentIndex]?.type === PlaylistItemType.TRACK &&
      items[currentIndex + 1]?.type === PlaylistItemType.MODERATION_TEXT) {
    return currentIndex + 1;
  }

  if (items[currentIndex - 1]?.type === PlaylistItemType.MODERATION_TEXT) {
    return currentIndex - 1;
  }

  return findPreviousModerationIndex(items, currentIndex);
}

// Distinct, readable colors on the dark background — assigned per speaker in order of appearance.
const SPEAKER_PALETTE = ['#fbbf24', '#60a5fa', '#4ade80', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

// A line that is exactly "Name:" (letters/spaces/&/./'/- then a colon, nothing after) starts a speaker block.
const SPEAKER_LINE = /^\s*([\p{L}][\p{L} .&'-]{0,29}):\s*$/u;

interface ModerationBlock {
  speaker: string | null;
  text: string;
}

function parseModerationBlocks(raw: string): ModerationBlock[] {
  const blocks: ModerationBlock[] = [];
  let current: ModerationBlock | null = null;
  for (const line of raw.split('\n')) {
    const match = line.match(SPEAKER_LINE);
    if (match) {
      current = { speaker: match[1].trim(), text: '' };
      blocks.push(current);
    } else {
      if (!current) {
        current = { speaker: null, text: '' };
        blocks.push(current);
      }
      current.text += (current.text ? '\n' : '') + line;
    }
  }
  return blocks;
}

function ModerationBody({ text }: { text: string }) {
  const blocks = parseModerationBlocks(text);
  const hasSpeakers = blocks.some((b) => b.speaker);

  // No "Name:" structure → render plainly (preserves the existing pre-wrap behaviour).
  if (!hasSpeakers) return <>{text}</>;

  const colors = new Map<string, string>();
  for (const b of blocks) {
    const key = b.speaker?.toLowerCase();
    if (key && !colors.has(key)) colors.set(key, SPEAKER_PALETTE[colors.size % SPEAKER_PALETTE.length]);
  }

  return (
    <>
      {blocks.map((b, i) => {
        if (!b.speaker) {
          return b.text.trim() ? (
            <div key={i} className={styles.speakerText}>{b.text.trim()}</div>
          ) : null;
        }
        const color = colors.get(b.speaker.toLowerCase())!;
        return (
          <div
            key={i}
            className={styles.speakerBlock}
            style={{ borderLeftColor: color, background: `${color}1a` }}
          >
            <div className={styles.speakerName} style={{ color }}>{b.speaker}</div>
            <div className={styles.speakerText}>{b.text.trim()}</div>
          </div>
        );
      })}
    </>
  );
}

export default function ModeratorPage() {
  const { isConnected, isLoading, playbackState, performanceStartTime, connect } = usePlayback();
  const now = useClock();

  useEffect(() => { connect(); }, [connect]);

  const { playlistItems = [], currentItemIndex = 0, currentModerationText, currentModerationAuthor } = playbackState;

  const displayModerationIndex = getDisplayModerationIndex(playlistItems, currentItemIndex);
  const displayModerationItem = displayModerationIndex >= 0 ? playlistItems[displayModerationIndex] : null;
  const isCurrentlyModeration = playlistItems[currentItemIndex]?.type === PlaylistItemType.MODERATION_TEXT;
  const isNextModerationPreview = playlistItems[currentItemIndex]?.type === PlaylistItemType.TRACK &&
    displayModerationIndex > currentItemIndex;
  const isModerationTextDimmed = displayModerationIndex >= 0 &&
    currentItemIndex !== displayModerationIndex &&
    currentItemIndex !== displayModerationIndex + 1;

  const displayModerationText = isCurrentlyModeration
    ? (currentModerationText ?? displayModerationItem?.moderation_text?.text)
    : displayModerationItem?.moderation_text?.text;
  const displayModerationAuthor = isCurrentlyModeration
    ? (currentModerationAuthor ?? displayModerationItem?.performer)
    : displayModerationItem?.performer;

  const recentSongs = songsBeforeModeration(playlistItems, displayModerationIndex);
  const upcomingSongs = songsAfterModeration(playlistItems, displayModerationIndex);

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
          <div className={styles.moderationContent}>
            {isNextModerationPreview && <div className={styles.nextLabel}>derzeit keine aktive Moderation</div>}
            <div className={`${styles.moderationText} ${isModerationTextDimmed ? styles.moderationTextDimmed : ''}`}>
              <ModerationBody text={displayModerationText} />
            </div>
          </div>
        ) : (
          <div className={styles.noModeration}>Keine weiteren Moderationen</div>
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div />
        <div className={styles.footerRight}>
          <div className={styles.runtime}>
            Laufzeit: {performanceStartTime ? formatElapsed(performanceStartTime, now) : '–'}
          </div>
          <div className={styles.clockTime}>{formatClock(now)}</div>
        </div>
      </footer>
    </div>
  );
}
