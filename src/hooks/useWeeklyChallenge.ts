/**
 * useWeeklyChallenge Hook
 *
 * Provides weekly challenge state with live countdown timer.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getActiveWeeklyChallenge,
  getWeeklyChallengeProgress,
} from '../services/achievements';
import { getTimeUntilWeeklyReset } from '../utils/challenges';
import { loadWeeklyChallengeState } from '../services/achievements/storage';
import type { WeeklyChallengeState } from '../services/achievements/types';

export interface WeeklyChallengeInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  reward: string;
}

export interface WeeklyChallengeProgress {
  current: number;
  target: number;
  percentage: number;
}

export interface UseWeeklyChallengeReturn {
  challenge: WeeklyChallengeInfo;
  progress: WeeklyChallengeProgress | null;
  completed: boolean;
  timeRemaining: string;
  timeRemainingMs: number;
  refreshState: () => void;
}

/**
 * Format milliseconds to human readable time string
 */
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Resetting...';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}

export function useWeeklyChallenge(): UseWeeklyChallengeReturn {
  const [weeklyState, setWeeklyState] = useState<WeeklyChallengeState | null>(null);
  const [timeRemainingMs, setTimeRemainingMs] = useState<number>(getTimeUntilWeeklyReset());
  const hasResetRef = useRef(false);

  // Load weekly state on mount
  useEffect(() => {
    setWeeklyState(loadWeeklyChallengeState());
  }, []);

  // Update countdown timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getTimeUntilWeeklyReset();
      setTimeRemainingMs(remaining);

      // If timer reaches 0 and we haven't reset yet, refresh state once
      if (remaining <= 0 && !hasResetRef.current) {
        hasResetRef.current = true;
        setWeeklyState(loadWeeklyChallengeState());
      }

      // Reset the flag once timer is positive again (new week started)
      if (remaining > 0) {
        hasResetRef.current = false;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Get active challenge info - updates when weeklyState changes (after reset)
  const challenge = useMemo((): WeeklyChallengeInfo => {
    const activeChallenge = getActiveWeeklyChallenge();
    return {
      id: activeChallenge.id,
      name: activeChallenge.name,
      description: activeChallenge.description,
      icon: activeChallenge.icon,
      rarity: activeChallenge.rarity,
      reward: activeChallenge.reward,
    };
  }, [weeklyState]);

  // Get progress
  const progress = useMemo((): WeeklyChallengeProgress | null => {
    if (!weeklyState) return null;
    return getWeeklyChallengeProgress(weeklyState);
  }, [weeklyState]);

  // Check if completed
  const completed = weeklyState?.completed ?? false;

  // Format time remaining
  const timeRemaining = useMemo(() => formatTimeRemaining(timeRemainingMs), [timeRemainingMs]);

  // Refresh state function (for manual refresh)
  const refreshState = useCallback(() => {
    setWeeklyState(loadWeeklyChallengeState());
  }, []);

  return {
    challenge,
    progress,
    completed,
    timeRemaining,
    timeRemainingMs,
    refreshState,
  };
}

export default useWeeklyChallenge;
