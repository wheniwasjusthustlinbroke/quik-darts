/**
 * useSound Hook
 *
 * Manages game sound effects using Web Audio API.
 */

import { useRef, useCallback, useState } from 'react';

export type SoundType =
  | 'throw'
  | 'hit'
  | 'bull'
  | 'double'
  | 'triple'
  | 'miss'
  | 'bust'
  | 'checkout'
  | '180'
  | 'click'
  | 'success'
  | 'error';

interface SoundConfig {
  frequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const SOUND_CONFIGS: Record<SoundType, SoundConfig> = {
  throw: { frequency: 200, duration: 0.1, type: 'sine', gain: 0.3 },
  hit: { frequency: 400, duration: 0.15, type: 'sine', gain: 0.4 },
  bull: { frequency: 800, duration: 0.2, type: 'sine', gain: 0.5 },
  double: { frequency: 600, duration: 0.15, type: 'sine', gain: 0.4 },
  triple: { frequency: 700, duration: 0.15, type: 'sine', gain: 0.45 },
  miss: { frequency: 150, duration: 0.2, type: 'sawtooth', gain: 0.2 },
  bust: { frequency: 100, duration: 0.3, type: 'sawtooth', gain: 0.3 },
  checkout: { frequency: 1000, duration: 0.4, type: 'sine', gain: 0.5 },
  '180': { frequency: 880, duration: 0.5, type: 'sine', gain: 0.6 },
  click: { frequency: 500, duration: 0.05, type: 'square', gain: 0.2 },
  success: { frequency: 600, duration: 0.2, type: 'sine', gain: 0.4 },
  error: { frequency: 200, duration: 0.3, type: 'sawtooth', gain: 0.3 },
};

export interface UseSoundReturn {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  playSound: (type: SoundType) => void;
  playTone: (frequency: number, duration?: number) => void;
}

export function useSound(): UseSoundReturn {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize AudioContext lazily (must be done after user interaction)
  const getAudioContext = useCallback((): AudioContext | null => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('Web Audio API not supported:', error);
        return null;
      }
    }

    // Resume if suspended (browsers require user interaction)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  // Play a raw tone
  const playTone = useCallback(
    (frequency: number, duration = 0.1, gain = 0.3) => {
      if (!soundEnabled) return;

      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
        gainNode.gain.setValueAtTime(gain, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          ctx.currentTime + duration
        );

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);
      } catch (error) {
        console.warn('Error playing tone:', error);
      }
    },
    [soundEnabled, getAudioContext]
  );

  // Play a predefined sound effect
  const playSound = useCallback(
    (type: SoundType) => {
      if (!soundEnabled) return;

      const config = SOUND_CONFIGS[type];
      if (!config) return;

      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = config.type;
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(config.frequency, ctx.currentTime);
        gainNode.gain.setValueAtTime(config.gain, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          ctx.currentTime + config.duration
        );

        // Special effects for certain sounds
        if (type === '180' || type === 'checkout') {
          // Add a second harmonic for richer sound
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.setValueAtTime(config.frequency * 1.5, ctx.currentTime);
          gain2.gain.setValueAtTime(config.gain * 0.5, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + config.duration
          );
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + config.duration);
        }

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + config.duration);
      } catch (error) {
        console.warn('Error playing sound:', error);
      }
    },
    [soundEnabled, getAudioContext]
  );

  return {
    soundEnabled,
    setSoundEnabled,
    playSound,
    playTone,
  };
}

export default useSound;
