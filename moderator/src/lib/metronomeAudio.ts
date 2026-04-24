/**
 * Metronome Audio - Generates tick/tock sounds using Web Audio API
 */

let audioContext: AudioContext | null = null;

/**
 * Initialize the audio context (must be called after user interaction)
 */
export function initAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  
  // Resume if suspended (happens after page load without interaction)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  return audioContext;
}

/**
 * Get the current audio context
 */
export function getAudioContext(): AudioContext | null {
  return audioContext;
}

/**
 * Play a metronome click sound
 * @param isAccent - Whether this is an accented beat (first beat of measure)
 * @param volume - Volume level (0-1)
 */
export function playClick(isAccent: boolean = false, volume: number = 0.5): void {
  if (!audioContext) {
    audioContext = initAudioContext();
  }
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const now = audioContext.currentTime;
  
  // Create oscillator for the click
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  // Connect nodes
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // Configure sound based on accent
  if (isAccent) {
    // Higher pitch, louder for accented beats (beat 1)
    oscillator.frequency.value = 1000;
    gainNode.gain.setValueAtTime(volume * 0.8, now);
  } else {
    // Lower pitch for regular beats
    oscillator.frequency.value = 800;
    gainNode.gain.setValueAtTime(volume * 0.5, now);
  }
  
  // Short click envelope
  oscillator.type = 'sine';
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  
  // Play
  oscillator.start(now);
  oscillator.stop(now + 0.05);
}

/**
 * Play a "wood block" style click (more natural sounding)
 */
export function playWoodClick(isAccent: boolean = false, volume: number = 0.5): void {
  if (!audioContext) {
    audioContext = initAudioContext();
  }
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const now = audioContext.currentTime;
  
  // Create multiple oscillators for richer sound
  const osc1 = audioContext.createOscillator();
  const osc2 = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const filterNode = audioContext.createBiquadFilter();
  
  // Connect nodes
  osc1.connect(filterNode);
  osc2.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // Configure filter
  filterNode.type = 'bandpass';
  filterNode.frequency.value = isAccent ? 1200 : 900;
  filterNode.Q.value = 1;
  
  // Configure oscillators
  osc1.type = 'sine';
  osc2.type = 'triangle';
  
  if (isAccent) {
    osc1.frequency.value = 1200;
    osc2.frequency.value = 600;
    gainNode.gain.setValueAtTime(volume * 0.7, now);
  } else {
    osc1.frequency.value = 900;
    osc2.frequency.value = 450;
    gainNode.gain.setValueAtTime(volume * 0.4, now);
  }
  
  // Quick decay envelope for percussive sound
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  
  // Play
  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.08);
  osc2.stop(now + 0.08);
}

/**
 * Play a count-in beep (distinct from regular clicks)
 */
export function playCountInBeep(beatNumber: number, volume: number = 0.6): void {
  if (!audioContext) {
    audioContext = initAudioContext();
  }
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const now = audioContext.currentTime;
  
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // Higher pitch for count-in, even higher for beat 1
  const isFirstBeat = beatNumber === 0;
  oscillator.frequency.value = isFirstBeat ? 1400 : 1100;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(isFirstBeat ? volume * 0.9 : volume * 0.6, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  oscillator.start(now);
  oscillator.stop(now + 0.1);
}

export type ClickSound = 'simple' | 'wood' | 'off';

/**
 * Play the appropriate click sound based on settings
 */
export function playMetronomeClick(
  soundType: ClickSound,
  isAccent: boolean,
  volume: number,
  isCountIn: boolean = false,
  countInBeat: number = 0
): void {
  if (soundType === 'off') return;
  
  if (isCountIn) {
    playCountInBeep(countInBeat, volume);
  } else if (soundType === 'wood') {
    playWoodClick(isAccent, volume);
  } else {
    playClick(isAccent, volume);
  }
}



