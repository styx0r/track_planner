'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './WaveformProgressBar.module.css';

const NUM_BARS = 120;

// Module-level cache so waveform data persists across re-renders and track changes
const waveformCache = new Map<string, number[]>();

// Deterministic fallback waveform used when audio can't be decoded
const FALLBACK_WAVEFORM = Array.from({ length: NUM_BARS }, (_, i) =>
  Math.max(0.08, Math.min(1, Math.sin(i * 0.18) * 0.35 + 0.5 + Math.sin(i * 0.71) * 0.18))
);

// Skeleton bars shown while waveform is loading
const LOADING_BARS = Array.from({ length: NUM_BARS }, () => 0.28);

interface WaveformProgressBarProps {
  audioUrl: string | null;
  durationMs: number;
  scheduledLocalStartTime: number | null;
  positionMs?: number;
  isPlaying: boolean;
  onSeek?: (positionMs: number) => void;
}

export function WaveformProgressBar({
  audioUrl,
  durationMs,
  scheduledLocalStartTime,
  positionMs,
  isPlaying,
  onSeek,
}: WaveformProgressBarProps) {
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Sync progress to positionMs when paused/stopped
  useEffect(() => {
    if (!isPlaying) {
      const p = positionMs && durationMs ? Math.min(positionMs / durationMs, 1) : 0;
      setProgress(p);
    }
  }, [isPlaying, positionMs, durationMs]);

  // Animate progress while playing
  useEffect(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!isPlaying || scheduledLocalStartTime === null || !durationMs) return;

    const tick = () => {
      const elapsed = Date.now() - scheduledLocalStartTime;
      setProgress(Math.min(elapsed / durationMs, 1));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, scheduledLocalStartTime, durationMs]);

  // Load and decode waveform from audio file
  useEffect(() => {
    if (!audioUrl) {
      setWaveform(FALLBACK_WAVEFORM);
      return;
    }

    if (waveformCache.has(audioUrl)) {
      setWaveform(waveformCache.get(audioUrl)!);
      return;
    }

    setWaveform(null); // show loading skeleton

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf);
        await ctx.close();
        if (cancelled) return;

        const channel = audio.getChannelData(0);
        const blockSize = Math.floor(channel.length / NUM_BARS);
        const data: number[] = [];

        for (let i = 0; i < NUM_BARS; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channel[i * blockSize + j]);
          }
          data.push(sum / blockSize);
        }

        const max = Math.max(...data);
        const normalized = data.map(v => (max > 0 ? v / max : 0));

        waveformCache.set(audioUrl, normalized);
        if (!cancelled) setWaveform(normalized);
      } catch {
        if (!cancelled) {
          waveformCache.set(audioUrl, FALLBACK_WAVEFORM);
          setWaveform(FALLBACK_WAVEFORM);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [audioUrl]);

  if (!durationMs) return null;

  const bars = waveform ?? LOADING_BARS;
  const isLoading = waveform === null;
  const currentMs = progress * durationMs;

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, ratio)) * durationMs);
  };

  return (
    <div className={`${styles.wrapper} ${isLoading ? styles.loading : ''}`}>
      <div
        className={`${styles.waveform} ${onSeek ? styles.seekable : ''}`}
        onClick={handleWaveformClick}
      >
        {bars.map((amp, i) => (
          <div
            key={i}
            className={`${styles.bar} ${i / NUM_BARS <= progress ? styles.active : ''}`}
            style={{ '--amp': amp } as React.CSSProperties}
          />
        ))}
      </div>
      <div className={styles.times}>
        <span>{formatMs(currentMs)}</span>
        <span>{formatMs(durationMs)}</span>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
