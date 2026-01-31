/**
 * useSound Hook
 *
 * Manages game sound effects using Web Audio API.
 * Ported from legacy index.html implementation.
 */

import { useRef, useCallback, useState } from 'react';

export type SoundType =
  | 'throw'
  | 'hit'
  | 'bull'
  | 'bullseye'
  | 'double'
  | 'triple'
  | 'miss'
  | 'bust'
  | 'checkout'
  | 'win'
  | '180'
  | 'ninedarter'
  | 'click'
  | 'success'
  | 'error';

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
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch (error) {
        console.warn('Web Audio API not supported:', error);
        return null;
      }
    }

    // Resume if suspended (browsers require user interaction)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch((err) => {
        console.warn('Failed to resume AudioContext:', err);
      });
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

  // Play a predefined sound effect (matches legacy implementation)
  const playSound = useCallback(
    (type: SoundType) => {
      if (!soundEnabled) return;

      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        switch (type) {
          case 'throw': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(200, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.1);
            break;
          }

          case 'hit': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(800, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.05);
            break;
          }

          case 'double': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(600, ctx.currentTime);
            oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.08);
            gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.15);
            break;
          }

          case 'triple': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(700, ctx.currentTime);
            oscillator.frequency.setValueAtTime(900, ctx.currentTime + 0.08);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.15);
            break;
          }

          case 'bull':
          case 'bullseye': {
            // Ascending 3-note sequence (C5 -> E5 -> G5)
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(523, ctx.currentTime);
            oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.3);
            break;
          }

          case 'miss': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.type = 'sawtooth';
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(150, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
            gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.15);
            break;
          }

          case 'bust': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(200, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
            gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.3);
            break;
          }

          case 'checkout':
          case 'win': {
            // 4-note ascending fanfare (C5 -> E5 -> G5 -> C6)
            [523, 659, 784, 1047].forEach((freq, i) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
              gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.2);
              osc.start(ctx.currentTime + i * 0.15);
              osc.stop(ctx.currentTime + i * 0.15 + 0.2);
            });
            break;
          }

          case '180': {
            // 6-note ascending celebration (G4 -> C5 -> E5 -> G5 -> C6 -> E6)
            [392, 523, 659, 784, 1047, 1319].forEach((freq, i) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
              gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.08);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.08 + 0.15);
              osc.start(ctx.currentTime + i * 0.08);
              osc.stop(ctx.currentTime + i * 0.08 + 0.15);
            });
            break;
          }

          case 'ninedarter': {
            // Epic crowd roar + fanfare
            // Create white noise for crowd roar
            const bufferSize = ctx.sampleRate * 3; // 3 seconds
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
              data[i] = Math.random() * 2 - 1;
            }
            const crowdNoise = ctx.createBufferSource();
            crowdNoise.buffer = buffer;

            const crowdFilter = ctx.createBiquadFilter();
            crowdFilter.type = 'bandpass';
            crowdFilter.frequency.setValueAtTime(800, ctx.currentTime);
            crowdFilter.Q.setValueAtTime(1, ctx.currentTime);

            const crowdGain = ctx.createGain();
            crowdGain.gain.setValueAtTime(0, ctx.currentTime);
            crowdGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.5);
            crowdGain.gain.setValueAtTime(0.3, ctx.currentTime + 2);
            crowdGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 3);

            crowdNoise.connect(crowdFilter);
            crowdFilter.connect(crowdGain);
            crowdGain.connect(ctx.destination);
            crowdNoise.start(ctx.currentTime);
            crowdNoise.stop(ctx.currentTime + 3);

            // Add epic fanfare over the crowd roar
            [523, 659, 784, 1047, 1319, 1568].forEach((freq, i) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'triangle';
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
              gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.15);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
              osc.start(ctx.currentTime + i * 0.15);
              osc.stop(ctx.currentTime + i * 0.15 + 0.4);
            });
            break;
          }

          case 'click': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.type = 'square';
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(500, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.05);
            break;
          }

          case 'success': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(523, ctx.currentTime);
            oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.2);
            break;
          }

          case 'error': {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.type = 'sawtooth';
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(200, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.3);
            break;
          }
        }
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
