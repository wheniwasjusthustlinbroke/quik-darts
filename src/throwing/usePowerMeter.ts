/**
 * usePowerMeter Hook - Oscillating Power System
 *
 * Legacy-matching oscillating power meter (0→100→0→100...).
 * Uses setInterval at 20ms with ±2 step.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { OSCILLATION_INTERVAL_MS, OSCILLATION_STEP } from './legacyMeter';

export interface UsePowerMeterOptions {
  /** Callback when power is released - receives final power value */
  onRelease?: (power: number) => void;
  /** Disable charging */
  disabled?: boolean;
}

export interface UsePowerMeterReturn {
  /** Current power value (0-100) */
  power: number;
  /** Whether currently charging */
  isCharging: boolean;
  /** Pointer event handlers to spread on target element */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
  /** Manual reset function */
  reset: () => void;
}

export function usePowerMeter(
  options: UsePowerMeterOptions = {}
): UsePowerMeterReturn {
  const { onRelease, disabled = false } = options;

  const [power, setPower] = useState(0);
  const [isCharging, setIsCharging] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const powerRef = useRef(0);
  const directionRef = useRef<'up' | 'down'>('up');
  const pointerIdRef = useRef<number | null>(null);
  const releasedRef = useRef(false);

  // Stop oscillation
  const stopCharging = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Start charging (oscillating)
  const startCharging = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || isCharging) return;

      // Capture pointer for reliable tracking
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        pointerIdRef.current = e.pointerId;
      } catch {
        /* ignore */
      }

      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      releasedRef.current = false;
      setIsCharging(true);
      setPower(0);
      powerRef.current = 0;
      directionRef.current = 'up';

      // OSCILLATING: 0→100→0→100... at 20ms intervals, ±2 per step
      intervalRef.current = setInterval(() => {
        if (directionRef.current === 'up') {
          powerRef.current += OSCILLATION_STEP;
          if (powerRef.current >= 100) {
            powerRef.current = 100;
            directionRef.current = 'down';
          }
        } else {
          powerRef.current -= OSCILLATION_STEP;
          if (powerRef.current <= 0) {
            powerRef.current = 0;
            directionRef.current = 'up';
          }
        }
        setPower(powerRef.current);
      }, OSCILLATION_INTERVAL_MS);
    },
    [disabled, isCharging]
  );

  // Release and throw
  const release = useCallback(
    (e?: React.PointerEvent) => {
      if (!isCharging || releasedRef.current) return;

      // Release pointer capture
      if (e && pointerIdRef.current !== null) {
        try {
          (e.target as HTMLElement).releasePointerCapture(pointerIdRef.current);
        } catch {
          /* ignore */
        }
      }
      pointerIdRef.current = null;

      releasedRef.current = true;
      stopCharging();
      setIsCharging(false);

      const finalPower = powerRef.current;
      onRelease?.(finalPower);

      // INTENTIONAL UX: Show where user stopped briefly before resetting
      // Not legacy-derived - added for visual feedback
      setTimeout(() => {
        setPower(0);
        powerRef.current = 0;
        directionRef.current = 'up';
      }, 500);
    },
    [isCharging, stopCharging, onRelease]
  );

  // Cancel charging
  const cancel = useCallback(() => {
    if (!isCharging) return;
    pointerIdRef.current = null;
    stopCharging();
    setIsCharging(false);
    setPower(0);
    powerRef.current = 0;
    directionRef.current = 'up';
  }, [isCharging, stopCharging]);

  // Handle pointer leave
  const handlePointerLeave = useCallback(
    (_e: React.PointerEvent) => {
      if (isCharging) cancel();
    },
    [isCharging, cancel]
  );

  // Prevent context menu during charge
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isCharging) {
        e.preventDefault();
        cancel();
      }
    },
    [isCharging, cancel]
  );

  // Manual reset
  const reset = useCallback(() => {
    stopCharging();
    setPower(0);
    powerRef.current = 0;
    directionRef.current = 'up';
    setIsCharging(false);
    releasedRef.current = false;
    pointerIdRef.current = null;
  }, [stopCharging]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCharging();
  }, [stopCharging]);

  // Handle blur/visibility
  useEffect(() => {
    const handleBlur = () => {
      if (isCharging) cancel();
    };
    const handleVisibility = () => {
      if (document.hidden && isCharging) cancel();
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isCharging, cancel]);

  return {
    power,
    isCharging,
    handlers: {
      onPointerDown: startCharging,
      onPointerUp: release,
      onPointerCancel: () => cancel(),
      onPointerLeave: handlePointerLeave,
      onContextMenu: handleContextMenu,
    },
    reset,
  };
}
