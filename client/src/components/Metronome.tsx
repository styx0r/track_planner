'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  initAudioContext, 
  playMetronomeClick, 
  ClickSound 
} from '../lib/metronomeAudio';
import styles from './Metronome.module.css';

interface MetronomeProps {
  enabled: boolean;
  bpm: number;
  startTime: number | null; // Local start time for song (from sync)
  countInStartTime: number | null; // Local start time for count-in
  countInBeats: number;
  onToggle: (enabled: boolean) => void;
  onBpmChange: (bpm: number) => void;
}

export function Metronome({ 
  enabled, 
  bpm, 
  startTime, 
  countInStartTime,
  countInBeats,
  onToggle, 
  onBpmChange 
}: MetronomeProps) {
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBeat, setCountInBeat] = useState(0);
  
  // Audio settings
  const [soundType, setSoundType] = useState<ClickSound>('wood');
  const [volume, setVolume] = useState(0.5);
  const [audioInitialized, setAudioInitialized] = useState(false);
  
  const animationRef = useRef<number | null>(null);
  const lastBeatRef = useRef<number>(-1);
  const lastCountInBeatRef = useRef<number>(-1);

  // Calculate beat timing
  const beatInterval = 60000 / bpm; // ms per beat

  // Initialize audio on first user interaction
  const handleEnableClick = useCallback(() => {
    if (!audioInitialized && soundType !== 'off') {
      initAudioContext();
      setAudioInitialized(true);
    }
    onToggle(!enabled);
  }, [audioInitialized, soundType, enabled, onToggle]);

  // Play sound when beat changes
  const playBeatSound = useCallback((isAccent: boolean, isCountIn: boolean, countBeat: number) => {
    if (soundType === 'off' || !audioInitialized) return;
    playMetronomeClick(soundType, isAccent, volume, isCountIn, countBeat);
  }, [soundType, volume, audioInitialized]);

  // Metronome animation loop
  const animate = useCallback(() => {
    if (!enabled) {
      setCurrentBeat(0);
      setIsFlashing(false);
      setIsCountingIn(false);
      return;
    }

    const now = Date.now();
    
    // Check if we're in count-in phase
    if (countInStartTime !== null && countInBeats > 0) {
      const countInElapsed = now - countInStartTime;
      
      if (countInElapsed >= 0 && countInElapsed < countInBeats * beatInterval) {
        // We're in count-in phase
        const countBeat = Math.floor(countInElapsed / beatInterval);
        
        if (countBeat !== lastCountInBeatRef.current) {
          lastCountInBeatRef.current = countBeat;
          setCountInBeat(countBeat);
          setIsCountingIn(true);
          setIsFlashing(true);
          
          // Play count-in sound
          playBeatSound(countBeat % 4 === 0, true, countBeat % 4);
          
          setTimeout(() => setIsFlashing(false), 50);
        }
        
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
    }
    
    // Regular playback phase
    setIsCountingIn(false);
    
    if (startTime === null) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    const elapsed = now - startTime;

    if (elapsed < 0) {
      // Not started yet, schedule next frame
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    // Calculate current beat
    const beat = Math.floor(elapsed / beatInterval);
    const beatInMeasure = beat % 4; // Assuming 4/4 time

    if (beat !== lastBeatRef.current) {
      lastBeatRef.current = beat;
      setCurrentBeat(beatInMeasure);
      setIsFlashing(true);
      
      // Play regular beat sound
      playBeatSound(beatInMeasure === 0, false, beatInMeasure);
      
      // Flash duration
      setTimeout(() => setIsFlashing(false), 50);
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [enabled, startTime, countInStartTime, countInBeats, beatInterval, playBeatSound]);

  // Start/stop animation
  useEffect(() => {
    if (enabled) {
      lastBeatRef.current = -1;
      lastCountInBeatRef.current = -1;
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enabled, animate]);

  // Reset when times change
  useEffect(() => {
    lastBeatRef.current = -1;
    lastCountInBeatRef.current = -1;
  }, [startTime, countInStartTime]);

  // Initialize audio when sound is enabled
  useEffect(() => {
    if (soundType !== 'off' && !audioInitialized) {
      // Will be initialized on first interaction
    }
  }, [soundType, audioInitialized]);

  // Handle BPM input
  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 20 && value <= 300) {
      onBpmChange(value);
    }
  };

  // Handle sound type change
  const handleSoundTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as ClickSound;
    setSoundType(newType);
    
    // Initialize audio if needed
    if (newType !== 'off' && !audioInitialized) {
      initAudioContext();
      setAudioInitialized(true);
    }
  };

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  // Test sound button
  const handleTestSound = () => {
    if (!audioInitialized) {
      initAudioContext();
      setAudioInitialized(true);
    }
    playMetronomeClick(soundType, true, volume, false, 0);
  };

  return (
    <div className={styles.metronome}>
      <div className={styles.header}>
        <h3 className={styles.title}>Metronome</h3>
        <button 
          className={`${styles.toggleBtn} ${enabled ? styles.active : ''}`}
          onClick={handleEnableClick}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Count-in indicator */}
      {isCountingIn && (
        <div className={styles.countIn}>
          <span className={styles.countInLabel}>COUNT IN</span>
          <div className={styles.countInNumber}>
            {countInBeat + 1}
          </div>
        </div>
      )}

      <div className={`${styles.visualizer} ${isCountingIn ? styles.hidden : ''}`}>
        {[0, 1, 2, 3].map((beat) => (
          <div
            key={beat}
            className={`
              ${styles.beat}
              ${beat === 0 ? styles.accent : ''}
              ${enabled && currentBeat === beat && !isCountingIn ? styles.active : ''}
              ${enabled && currentBeat === beat && isFlashing && !isCountingIn ? styles.flash : ''}
            `}
          >
            <span className={styles.beatNumber}>{beat + 1}</span>
          </div>
        ))}
      </div>

      <div className={styles.pendulum}>
        <div 
          className={`${styles.pendulumArm} ${enabled ? styles.swinging : ''}`}
          style={{ 
            animationDuration: enabled ? `${beatInterval * 2}ms` : '0s' 
          }}
        >
          <div className={`${styles.pendulumBob} ${isCountingIn ? styles.countInBob : ''}`} />
        </div>
      </div>

      <div className={styles.controls}>
        <label className={styles.bpmLabel}>
          <span>BPM</span>
          <input
            type="number"
            min="20"
            max="300"
            value={bpm}
            onChange={handleBpmChange}
            className={styles.bpmInput}
          />
        </label>
        <div className={styles.bpmSlider}>
          <input
            type="range"
            min="20"
            max="300"
            value={bpm}
            onChange={handleBpmChange}
            className={styles.slider}
          />
        </div>
      </div>

      {/* Sound Controls */}
      <div className={styles.soundControls}>
        <div className={styles.soundRow}>
          <label className={styles.soundLabel}>
            <span>Sound</span>
            <select 
              value={soundType} 
              onChange={handleSoundTypeChange}
              className={styles.soundSelect}
            >
              <option value="off">Off</option>
              <option value="simple">Simple</option>
              <option value="wood">Wood Block</option>
            </select>
          </label>
          <button 
            className={styles.testBtn}
            onClick={handleTestSound}
            disabled={soundType === 'off'}
            title="Test sound"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </button>
        </div>
        
        {soundType !== 'off' && (
          <div className={styles.volumeControl}>
            <span className={styles.volumeLabel}>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className={styles.volumeSlider}
            />
            <span className={styles.volumeValue}>{Math.round(volume * 100)}%</span>
          </div>
        )}
      </div>

      {enabled && (startTime || countInStartTime) && (
        <div className={styles.syncInfo}>
          <span className={styles.syncDot} />
          {isCountingIn ? 'Counting in...' : 'Synchronized'}
        </div>
      )}
    </div>
  );
}
