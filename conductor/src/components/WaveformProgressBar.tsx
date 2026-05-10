'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './WaveformProgressBar.module.css';

const NUM_BARS = 120;

// Deterministic fallback waveform used when backend data is not available yet
const FALLBACK_WAVEFORM = Array.from({ length: NUM_BARS }, (_, i) =>
  Math.max(0.08, Math.min(1, Math.sin(i * 0.18) * 0.35 + 0.5 + Math.sin(i * 0.71) * 0.18))
);

interface WaveformProgressBarProps {
  waveformData?: number[] | null;
  durationMs: number;
  scheduledLocalStartTime: number | null;
  positionMs?: number;
  isPlaying: boolean;
  onSeek?: (positionMs: number) => void;
}

export function WaveformProgressBar({
  waveformData,
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

    if (!isPlaying || scheduledLocalStartTime === null || !durationMs || durationMs <= 0) return;

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

  // Use compact waveform data calculated by the backend. The client only renders
  // bars and progress; it no longer downloads the audio file for visualization.
  useEffect(() => {
    if (!waveformData || waveformData.length === 0) {
      setWaveform(FALLBACK_WAVEFORM);
      return;
    }

    setWaveform(waveformData.slice(0, NUM_BARS));
  }, [waveformData]);

  // Show placeholder only when no track is loaded at all
  if (!durationMs) {
    return <div className={styles.placeholder} />;
  }

  const bars = waveform ?? FALLBACK_WAVEFORM;
  const effectiveDuration = durationMs || 0;
  const currentMs = progress * effectiveDuration;

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, ratio)) * effectiveDuration);
  };

  return (
    <div className={styles.wrapper}>
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
      {effectiveDuration > 0 && (
        <div className={styles.times}>
          <span>{formatMs(currentMs)}</span>
          <span>{formatMs(effectiveDuration)}</span>
        </div>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
