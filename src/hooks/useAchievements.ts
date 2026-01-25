/**
 * Achievement Tracking Hook
 *
 * Wires achievement events from game logic to the achievement engine.
 * Handles persistence and provides event emitters for game integration.
 */

import { useCallback, useRef, useEffect } from 'react';
import {
  AchievementsState,
  WeeklyChallengeState,
  AchievementEvent,
  ThrowEvent,
  TurnCompleteEvent,
  CheckoutEvent,
  LegCompleteEvent,
  GameCompleteEvent,
  WageredPayoutEvent,
  DailyLoginEvent,
  EvaluationResult,
  createEventId,
} from '../services/achievements/types';
import { recordEvent } from '../services/achievements/engine';
import {
  loadAchievementsState,
  loadWeeklyChallengeState,
  saveAchievementsState,
  saveWeeklyChallengeState,
} from '../services/achievements/storage';

// === Types ===

interface UseAchievementsOptions {
  /** Is this an online match? */
  isOnline: boolean;
  /** Is this practice mode (no AI opponent)? */
  isPractice: boolean;
  /** Does the match have an AI opponent? */
  hasAIOpponent: boolean;
  /** Is this a wagered match? */
  isWagered: boolean;
  /** Callback when achievements unlock */
  onUnlock?: (achievementIds: string[]) => void;
}

interface UseAchievementsReturn {
  /** Start tracking a new match */
  startMatch: (matchId: string) => void;
  /** Start tracking a new leg within match */
  startLeg: (legId: string) => void;
  /** Record a single dart throw */
  emitThrow: (params: {
    score: number;
    segment: string;
    multiplier: number;
    isBull: boolean;
    isTriple: boolean;
  }) => void;
  /** Record end of turn (3 darts) */
  emitTurnComplete: (params: { turnScore: number; is180: boolean }) => void;
  /** Record a checkout */
  emitCheckout: (checkoutValue: number) => void;
  /** Record leg completion */
  emitLegComplete: (params: { won: boolean; dartsUsed: number }) => void;
  /** Record game/match completion */
  emitGameComplete: (won: boolean) => void;
  /** Record wagered payout */
  emitWageredPayout: (params: { payout: number; stake: number }) => void;
  /** Record daily login (call once per session) */
  emitDailyLogin: () => void;
  /** Get current achievements state (for UI) */
  getState: () => AchievementsState;
  /** Get current weekly challenge state (for UI) */
  getWeeklyState: () => WeeklyChallengeState;
}

// === Hook ===

export function useAchievements(options: UseAchievementsOptions): UseAchievementsReturn {
  // Store options in ref to always get latest values (options may change during lifecycle)
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Compute tracking enabled dynamically (reads from ref for reactivity)
  const getIsTrackingEnabled = useCallback(() => {
    const { isOnline, isPractice, hasAIOpponent } = optionsRef.current;
    return isOnline || (!isPractice && hasAIOpponent);
  }, []);

  // State refs (mutable, persisted)
  const achievementsStateRef = useRef<AchievementsState | null>(null);
  const weeklyStateRef = useRef<WeeklyChallengeState | null>(null);

  // Match/leg tracking
  const currentMatchIdRef = useRef<string | null>(null);
  const currentLegIdRef = useRef<string | null>(null);
  const throwIndexRef = useRef<number>(0);
  const turnIndexRef = useRef<number>(0);

  // Initialize state on mount
  useEffect(() => {
    if (achievementsStateRef.current === null) {
      achievementsStateRef.current = loadAchievementsState();
    }
    if (weeklyStateRef.current === null) {
      weeklyStateRef.current = loadWeeklyChallengeState();
    }
  }, []);

  // Helper: get or create state
  const getAchievementsState = useCallback((): AchievementsState => {
    if (achievementsStateRef.current === null) {
      achievementsStateRef.current = loadAchievementsState();
    }
    return achievementsStateRef.current;
  }, []);

  const getWeeklyState = useCallback((): WeeklyChallengeState => {
    if (weeklyStateRef.current === null) {
      weeklyStateRef.current = loadWeeklyChallengeState();
    }
    return weeklyStateRef.current;
  }, []);

  // Helper: process event and handle results
  const processEvent = useCallback(
    (event: AchievementEvent): EvaluationResult => {
      const state = getAchievementsState();
      const weeklyState = getWeeklyState();

      const result = recordEvent(event, state, weeklyState);

      // Persist changes
      saveAchievementsState(state);
      saveWeeklyChallengeState(weeklyState);

      // Notify on new unlocks
      if (result.newUnlocks.length > 0 && optionsRef.current.onUnlock) {
        optionsRef.current.onUnlock(result.newUnlocks);
      }

      return result;
    },
    [getAchievementsState, getWeeklyState]
  );

  // === Public API ===

  const startMatch = useCallback((matchId: string) => {
    currentMatchIdRef.current = matchId;
    currentLegIdRef.current = null;
    throwIndexRef.current = 0;
    turnIndexRef.current = 0;
  }, []);

  const startLeg = useCallback((legId: string) => {
    currentLegIdRef.current = legId;
    throwIndexRef.current = 0;
    turnIndexRef.current = 0;
  }, []);

  const emitThrow = useCallback(
    (params: {
      score: number;
      segment: string;
      multiplier: number;
      isBull: boolean;
      isTriple: boolean;
    }) => {
      if (!getIsTrackingEnabled()) return;

      const matchId = currentMatchIdRef.current;
      const legId = currentLegIdRef.current;
      if (!matchId || !legId) return;

      const throwIndex = throwIndexRef.current++;

      const event: ThrowEvent = {
        type: 'THROW',
        eventId: createEventId(matchId, 'THROW', legId, throwIndex),
        ts: Date.now(),
        matchId,
        legId,
        throwIndex,
        score: params.score,
        segment: params.segment,
        multiplier: params.multiplier,
        isBull: params.isBull,
        isTriple: params.isTriple,
      };

      processEvent(event);
    },
    [getIsTrackingEnabled, processEvent]
  );

  const emitTurnComplete = useCallback(
    (params: { turnScore: number; is180: boolean }) => {
      if (!getIsTrackingEnabled()) return;

      const matchId = currentMatchIdRef.current;
      const legId = currentLegIdRef.current;
      if (!matchId || !legId) return;

      const turnIndex = turnIndexRef.current++;

      const event: TurnCompleteEvent = {
        type: 'TURN_COMPLETE',
        eventId: createEventId(matchId, 'TURN_COMPLETE', legId, turnIndex),
        ts: Date.now(),
        matchId,
        legId,
        turnIndex,
        turnScore: params.turnScore,
        is180: params.is180,
      };

      processEvent(event);
    },
    [getIsTrackingEnabled, processEvent]
  );

  const emitCheckout = useCallback(
    (checkoutValue: number) => {
      if (!getIsTrackingEnabled()) return;

      const matchId = currentMatchIdRef.current;
      const legId = currentLegIdRef.current;
      if (!matchId || !legId) return;

      const event: CheckoutEvent = {
        type: 'CHECKOUT',
        eventId: createEventId(matchId, 'CHECKOUT', legId),
        ts: Date.now(),
        matchId,
        legId,
        checkoutValue,
      };

      processEvent(event);
    },
    [getIsTrackingEnabled, processEvent]
  );

  const emitLegComplete = useCallback(
    (params: { won: boolean; dartsUsed: number }) => {
      if (!getIsTrackingEnabled()) return;

      const matchId = currentMatchIdRef.current;
      const legId = currentLegIdRef.current;
      if (!matchId || !legId) return;

      const event: LegCompleteEvent = {
        type: 'LEG_COMPLETE',
        eventId: createEventId(matchId, 'LEG_COMPLETE', legId),
        ts: Date.now(),
        matchId,
        legId,
        dartsUsed: params.dartsUsed,
        won: params.won,
      };

      processEvent(event);
    },
    [getIsTrackingEnabled, processEvent]
  );

  const emitGameComplete = useCallback(
    (won: boolean) => {
      if (!getIsTrackingEnabled()) return;

      const matchId = currentMatchIdRef.current;
      if (!matchId) return;

      const event: GameCompleteEvent = {
        type: 'GAME_COMPLETE',
        eventId: createEventId(matchId, 'GAME_COMPLETE'),
        ts: Date.now(),
        matchId,
        won,
        isOnline: optionsRef.current.isOnline,
        isWagered: optionsRef.current.isWagered,
      };

      processEvent(event);
    },
    [getIsTrackingEnabled, processEvent]
  );

  const emitWageredPayout = useCallback(
    (params: { payout: number; stake: number }) => {
      // Wagered payouts are always tracked (already implies isWagered)
      const matchId = currentMatchIdRef.current;
      if (!matchId) return;

      const event: WageredPayoutEvent = {
        type: 'WAGERED_PAYOUT',
        eventId: createEventId(matchId, 'WAGERED_PAYOUT'),
        ts: Date.now(),
        matchId,
        payout: params.payout,
        stake: params.stake,
      };

      processEvent(event);
    },
    [processEvent]
  );

  const emitDailyLogin = useCallback(() => {
    // Daily login is always tracked (engagement metric)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const event: DailyLoginEvent = {
      type: 'DAILY_LOGIN',
      eventId: `daily:${today}`,
      ts: Date.now(),
      date: today,
    };

    processEvent(event);
  }, [processEvent]);

  const getState = useCallback((): AchievementsState => {
    return getAchievementsState();
  }, [getAchievementsState]);

  return {
    startMatch,
    startLeg,
    emitThrow,
    emitTurnComplete,
    emitCheckout,
    emitLegComplete,
    emitGameComplete,
    emitWageredPayout,
    emitDailyLogin,
    getState,
    getWeeklyState,
  };
}
