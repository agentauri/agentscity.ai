import { useCallback, useRef, useEffect } from 'react';
import { useSettingsStore } from '../stores/settings';

// =============================================================================
// Sound Types
// =============================================================================

export type SoundType =
  | 'trade'    // Commercial transaction
  | 'harm'     // Conflict/attack
  | 'death'    // Agent death
  | 'gather'   // Resource collection
  | 'work'     // Working
  | 'buy'      // Purchase
  | 'move'     // Movement (soft)
  | 'tick';    // Tick start (subtle)

// =============================================================================
// Sound Definitions (Web Audio API oscillator parameters)
// =============================================================================

interface SoundDef {
  frequency: number;      // Hz
  type: OscillatorType;   // sine, square, sawtooth, triangle
  duration: number;       // seconds
  attack: number;         // seconds
  decay: number;          // seconds
  volume: number;         // 0-1 (relative to master volume)
  pitchSlide?: number;    // Hz to slide to (optional)
}

const SOUNDS: Record<SoundType, SoundDef> = {
  trade: {
    frequency: 523,       // C5 - bright coin sound
    type: 'sine',
    duration: 0.15,
    attack: 0.01,
    decay: 0.14,
    volume: 0.3,
    pitchSlide: 659,      // Slide up to E5
  },
  harm: {
    frequency: 150,       // Low rumble
    type: 'sawtooth',
    duration: 0.2,
    attack: 0.01,
    decay: 0.19,
    volume: 0.25,
  },
  death: {
    frequency: 200,       // Descending tone
    type: 'triangle',
    duration: 0.4,
    attack: 0.02,
    decay: 0.38,
    volume: 0.3,
    pitchSlide: 80,       // Slide down
  },
  gather: {
    frequency: 440,       // A4 - pickup sound
    type: 'sine',
    duration: 0.1,
    attack: 0.01,
    decay: 0.09,
    volume: 0.2,
  },
  work: {
    frequency: 330,       // E4 - work sound
    type: 'triangle',
    duration: 0.12,
    attack: 0.02,
    decay: 0.1,
    volume: 0.15,
  },
  buy: {
    frequency: 587,       // D5 - purchase sound
    type: 'sine',
    duration: 0.12,
    attack: 0.01,
    decay: 0.11,
    volume: 0.25,
  },
  move: {
    frequency: 200,       // Soft footstep
    type: 'sine',
    duration: 0.05,
    attack: 0.01,
    decay: 0.04,
    volume: 0.05,         // Very soft
  },
  tick: {
    frequency: 1000,      // High subtle tick
    type: 'sine',
    duration: 0.02,
    attack: 0.005,
    decay: 0.015,
    volume: 0.03,         // Very subtle
  },
};

// =============================================================================
// Audio Context Singleton
// =============================================================================

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Resume audio context on user interaction (required by browsers)
function ensureAudioContextResumed(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

// =============================================================================
// Play Sound Function
// =============================================================================

function playSoundInternal(soundType: SoundType, masterVolume: number): void {
  const ctx = getAudioContext();
  ensureAudioContextResumed();

  const sound = SOUNDS[soundType];
  if (!sound) return;

  const now = ctx.currentTime;

  // Create oscillator
  const oscillator = ctx.createOscillator();
  oscillator.type = sound.type;
  oscillator.frequency.setValueAtTime(sound.frequency, now);

  // Apply pitch slide if defined
  if (sound.pitchSlide !== undefined) {
    oscillator.frequency.linearRampToValueAtTime(sound.pitchSlide, now + sound.duration);
  }

  // Create gain node for envelope
  const gainNode = ctx.createGain();
  const effectiveVolume = sound.volume * masterVolume;

  // ADSR envelope (simplified: attack, decay to 0)
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(effectiveVolume, now + sound.attack);
  gainNode.gain.linearRampToValueAtTime(0, now + sound.attack + sound.decay);

  // Connect and play
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + sound.duration);
}

// =============================================================================
// Hook
// =============================================================================

export function useAudio() {
  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const soundVolume = useSettingsStore((state) => state.soundVolume);

  // Store refs to avoid stale closures
  const soundEnabledRef = useRef(soundEnabled);
  const soundVolumeRef = useRef(soundVolume);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    soundVolumeRef.current = soundVolume;
  }, [soundEnabled, soundVolume]);

  const playSound = useCallback((soundType: SoundType) => {
    if (!soundEnabledRef.current) return;
    if (soundVolumeRef.current <= 0) return;

    try {
      playSoundInternal(soundType, soundVolumeRef.current);
    } catch (e) {
      console.warn('[Audio] Failed to play sound:', e);
    }
  }, []);

  return { playSound };
}

// =============================================================================
// Direct play function (for non-hook contexts)
// =============================================================================

export function playSound(soundType: SoundType): void {
  const state = useSettingsStore.getState();
  if (!state.soundEnabled) return;
  if (state.soundVolume <= 0) return;

  try {
    playSoundInternal(soundType, state.soundVolume);
  } catch (e) {
    console.warn('[Audio] Failed to play sound:', e);
  }
}
