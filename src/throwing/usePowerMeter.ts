/**
 * usePowerMeter Hook
 *
 * RAF-based monotonic power meter with state machine.
 * Handles pointer events, cancellation, rhythm variance, and double-throw guards.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  calculateMeterValue,
  generateFillDuration,
  isOvercharging as checkOvercharging,
  getOverchargePercent,
  getFillSpeedRatio,
  getSpeedLabel,
  OVERCHARGE_MAX,
  type RngFunction,
  type SpeedLabel,
} from './throwMeter';

export type MeterState = 'idle' | 'charging' | 'released' | 'cancelled';

export interface UsePowerMeterOptions {
  /** Callback when power is released */
  onRelease?: (power: number) => void;
  /** Callback when charging starts (use to initialize per-throw RNG) */
  onChargeStart?: () => void;
  /** Disable charging */
  disabled?: boolean;
  /** Injectable RNG for rhythm variance determinism */
  rng?: RngFunction;
}

export interface UsePowerMeterReturn {
  /** Raw power value (0-150, where 100+ is overcharge) */
  power: number;
  /** Display power clamped to 0-100 for main UI bar */
  displayPower: number;
  /** Whether currently charging */
  isCharging: boolean;
  /** Whether in overcharge zone */
  isOvercharging: boolean;
  /** Overcharge percentage (0-100) */
  overchargePercent: number;
  /** Current state machine state */
  meterState: MeterState;
  /** Fill speed ratio (1.0 = base, <1 = slower, >1 = faster) */
  fillSpeedRatio: number;
  /** Speed label for UI */
  speedLabel: SpeedLabel;
  /** Pointer event handlers to spread on target element */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
    onLostPointerCapture: (e: React.PointerEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
  /** Manual reset function */
  reset: () => void;
}

export function usePowerMeter(
  options: UsePowerMeterOptions = {}
): UsePowerMeterReturn {
  const { onRelease, onChargeStart, disabled = false, rng = Math.random } = options;

  const [power, setPower] = useState(0);
  const [meterState, setMeterState] = useState<MeterState>('idle');
  const [fillDuration, setFillDuration] = useState(() =>
    generateFillDuration(rng)
  );

  // Refs for RAF and timing
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const powerRef = useRef(0); // Avoid stale state on release
  const releasedRef = useRef(false); // Guard against double-release
  const pointerIdRef = useRef<number | null>(null);
  const fillDurationRef = useRef(fillDuration);

  // Keep fillDurationRef in sync
  useEffect(() => {
    fillDurationRef.current = fillDuration;
  }, [fillDuration]);

  // Stop RAF loop
  const stopCharging = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  // RAF update loop
  const updateMeter = useCallback((timestamp: number) => {
    if (startTimeRef.current === null) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const newPower = calculateMeterValue(elapsed, fillDurationRef.current);

    powerRef.current = newPower;
    setPower(newPower);

    // Continue until max overcharge
    if (newPower < OVERCHARGE_MAX) {
      rafRef.current = requestAnimationFrame(updateMeter);
    }
  }, []);

  // Start charging
  const startCharging = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || meterState === 'charging') return;

      // Capture pointer for reliable tracking
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        pointerIdRef.current = e.pointerId;
      } catch {
        // Ignore capture errors
      }

      // Initialize per-throw RNG BEFORE generating fill duration
      // This ensures the same RNG instance is used for variance + scatter
      onChargeStart?.();

      // Generate new fill duration for this throw (rhythm variance)
      const newFillDuration = generateFillDuration(rng);
      setFillDuration(newFillDuration);
      fillDurationRef.current = newFillDuration;

      releasedRef.current = false;
      powerRef.current = 0;
      setPower(0);
      setMeterState('charging');
      startTimeRef.current = null;
      rafRef.current = requestAnimationFrame(updateMeter);
    },
    [disabled, meterState, updateMeter, rng, onChargeStart]
  );

  // Release and throw
  const release = useCallback(
    (e?: React.PointerEvent) => {
      if (meterState !== 'charging' || releasedRef.current) return;

      // Release pointer capture
      if (e && pointerIdRef.current !== null) {
        try {
          (e.target as HTMLElement).releasePointerCapture(pointerIdRef.current);
        } catch {
          // Ignore
        }
      }
      pointerIdRef.current = null;

      releasedRef.current = true;
      stopCharging();
      setMeterState('released');

      // Use powerRef for current value (avoid stale state)
      const finalPower = powerRef.current;
      onRelease?.(finalPower);

      // Reset after short delay (show where user stopped)
      setTimeout(() => {
        setPower(0);
        powerRef.current = 0;
        setMeterState('idle');
      }, 400);
    },
    [meterState, stopCharging, onRelease]
  );

  // Cancel charging (various edge cases)
  const cancel = useCallback(() => {
    if (meterState !== 'charging') return;

    pointerIdRef.current = null;
    stopCharging();
    setPower(0);
    powerRef.current = 0;
    setMeterState('cancelled');

    setTimeout(() => setMeterState('idle'), 100);
  }, [meterState, stopCharging]);

  // Handle pointer leave while charging
  const handlePointerLeave = useCallback(
    (_e: React.PointerEvent) => {
      // Only cancel if we're charging
      if (meterState === 'charging') {
        cancel();
      }
    },
    [meterState, cancel]
  );

  // Handle lost pointer capture (critical for robustness)
  const handleLostPointerCapture = useCallback(
    (_e: React.PointerEvent) => {
      if (meterState === 'charging') {
        cancel();
      }
    },
    [meterState, cancel]
  );

  // Prevent context menu during charge
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (meterState === 'charging') {
        e.preventDefault();
        cancel();
      }
    },
    [meterState, cancel]
  );

  // Manual reset
  const reset = useCallback(() => {
    stopCharging();
    setPower(0);
    powerRef.current = 0;
    setMeterState('idle');
    releasedRef.current = false;
    pointerIdRef.current = null;
  }, [stopCharging]);

  // Handle blur and visibility change
  useEffect(() => {
    const handleBlur = () => {
      if (meterState === 'charging') cancel();
    };
    const handleVisibility = () => {
      if (document.hidden && meterState === 'charging') cancel();
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      stopCharging();
    };
  }, [cancel, stopCharging, meterState]);

  // Derived values
  const isOvercharging = checkOvercharging(power);
  const overchargePercent = getOverchargePercent(power);
  const fillSpeedRatio = getFillSpeedRatio(fillDuration);
  const speedLabel = getSpeedLabel(fillSpeedRatio);

  return {
    power,
    displayPower: Math.min(power, 100),
    isCharging: meterState === 'charging',
    isOvercharging,
    overchargePercent,
    meterState,
    fillSpeedRatio,
    speedLabel,
    handlers: {
      onPointerDown: startCharging,
      onPointerUp: release,
      onPointerCancel: () => cancel(),
      onPointerLeave: handlePointerLeave,
      onLostPointerCapture: handleLostPointerCapture,
      onContextMenu: handleContextMenu,
    },
    reset,
  };
}
