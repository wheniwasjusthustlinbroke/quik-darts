/**
 * Achievement Engine
 *
 * Processes events, updates stats, and evaluates achievement unlocks.
 * Idempotent via eventId deduplication.
 */

import {
  AchievementEvent,
  AchievementsState,
  WeeklyChallengeState,
  StatsState,
  WeeklyStatsState,
  EvaluationResult,
  ACHIEVEMENTS_SCHEMA_VERSION,
  WEEKLY_CHALLENGE_SCHEMA_VERSION,
} from './types';
import {
  ACHIEVEMENTS,
  WEEKLY_CHALLENGES,
  getCurrentWeekNumber,
  getActiveWeeklyChallenge,
} from './definitions';

// === Constants ===

/** Max processedEventIds to retain (prevents unbounded memory/storage growth) */
const MAX_PROCESSED_EVENTS = 5000;

// === Default State Factories ===

export function createDefaultStats(): StatsState {
  return {
    totalGamesPlayed: 0,
    totalGamesWon: 0,
    totalOnlineGames: 0,
    totalOnlineWins: 0,
    totalWageredGames: 0,
    totalWageredWins: 0,
    totalWageredProfit: 0,
    total180s: 0,
    totalNineDarters: 0,
    totalBulls: 0,
    totalTriples: 0,
    highestCheckout: 0,
    currentDailyStreak: 0,
    longestDailyStreak: 0,
    lastPlayDate: null,
  };
}

export function createDefaultWeeklyStats(): WeeklyStatsState {
  return {
    weekly180s: 0,
    weeklyBulls: 0,
    weeklyWins: 0,
    weeklyTriples: 0,
  };
}

export function createDefaultAchievementsState(): AchievementsState {
  return {
    schemaVersion: ACHIEVEMENTS_SCHEMA_VERSION,
    unlockedIds: new Set(),
    stats: createDefaultStats(),
    processedEventIds: new Set(),
  };
}

export function createDefaultWeeklyChallengeState(): WeeklyChallengeState {
  const week = getCurrentWeekNumber();
  const challenge = getActiveWeeklyChallenge();
  return {
    schemaVersion: WEEKLY_CHALLENGE_SCHEMA_VERSION,
    weekNumber: week,
    challengeId: challenge.id,
    stats: createDefaultWeeklyStats(),
    completed: false,
    completedChallenges: [],
  };
}

// === Main Engine ===

/**
 * Record an event and update state.
 * Idempotent: duplicate eventIds are ignored.
 *
 * @returns EvaluationResult with any new unlocks
 */
export function recordEvent(
  event: AchievementEvent,
  state: AchievementsState,
  weeklyState: WeeklyChallengeState
): EvaluationResult {
  // Idempotency check
  if (state.processedEventIds.has(event.eventId)) {
    return { newUnlocks: [], statsUpdated: false, weeklyProgressUpdated: false };
  }

  // Mark event as processed
  state.processedEventIds.add(event.eventId);

  // Cap processedEventIds to prevent unbounded growth
  if (state.processedEventIds.size > MAX_PROCESSED_EVENTS) {
    // Set preserves insertion order; Array.from gives oldest -> newest
    const ids = Array.from(state.processedEventIds);
    const overflow = ids.length - MAX_PROCESSED_EVENTS;
    for (let i = 0; i < overflow; i++) {
      state.processedEventIds.delete(ids[i]);
    }
  }

  // Apply event to stats
  const statsUpdated = applyEvent(event, state.stats);

  // Apply event to weekly stats (if week matches)
  const weeklyProgressUpdated = applyWeeklyEvent(event, weeklyState);

  // Evaluate achievements
  const newUnlocks = evaluate(state);

  // Check weekly challenge completion
  checkWeeklyChallengeCompletion(weeklyState, state);

  return { newUnlocks, statsUpdated, weeklyProgressUpdated };
}

/**
 * Apply an event to cumulative stats.
 * @returns true if any stat was modified
 */
function applyEvent(event: AchievementEvent, stats: StatsState): boolean {
  let modified = false;

  switch (event.type) {
    case 'GAME_COMPLETE': {
      stats.totalGamesPlayed++;
      modified = true;

      if (event.won) {
        stats.totalGamesWon++;
      }

      if (event.isOnline) {
        stats.totalOnlineGames++;
        if (event.won) {
          stats.totalOnlineWins++;
        }
      }

      if (event.isWagered) {
        stats.totalWageredGames++;
        if (event.won) {
          stats.totalWageredWins++;
        }
      }
      break;
    }

    case 'LEG_COMPLETE': {
      // Nine-darter detection: won leg in exactly 9 darts
      if (event.won && event.dartsUsed === 9) {
        stats.totalNineDarters++;
        modified = true;
      }
      break;
    }

    case 'THROW': {
      if (event.isBull) {
        stats.totalBulls++;
        modified = true;
      }
      if (event.isTriple) {
        stats.totalTriples++;
        modified = true;
      }
      break;
    }

    case 'TURN_COMPLETE': {
      if (event.is180) {
        stats.total180s++;
        modified = true;
      }
      break;
    }

    case 'CHECKOUT': {
      if (event.checkoutValue > stats.highestCheckout) {
        stats.highestCheckout = event.checkoutValue;
        modified = true;
      }
      break;
    }

    case 'WAGERED_PAYOUT': {
      // Net profit = payout - stake
      const netProfit = event.payout - event.stake;
      stats.totalWageredProfit += netProfit;
      modified = true;
      break;
    }

    case 'DAILY_LOGIN': {
      modified = updateDailyStreak(stats, event.date);
      break;
    }
  }

  return modified;
}

/**
 * Update daily streak based on login date.
 * @returns true if streak was modified
 */
function updateDailyStreak(stats: StatsState, dateStr: string): boolean {
  const today = dateStr; // YYYY-MM-DD format
  const lastPlay = stats.lastPlayDate;

  if (lastPlay === today) {
    // Already played today, no change
    return false;
  }

  if (lastPlay === null) {
    // First ever play
    stats.currentDailyStreak = 1;
    stats.longestDailyStreak = 1;
    stats.lastPlayDate = today;
    return true;
  }

  // Check if yesterday
  const lastDate = new Date(lastPlay + 'T00:00:00Z');
  const todayDate = new Date(today + 'T00:00:00Z');
  const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000);

  if (diffDays === 1) {
    // Consecutive day - extend streak
    stats.currentDailyStreak++;
    if (stats.currentDailyStreak > stats.longestDailyStreak) {
      stats.longestDailyStreak = stats.currentDailyStreak;
    }
  } else if (diffDays > 1) {
    // Streak broken - reset to 1
    stats.currentDailyStreak = 1;
  }
  // diffDays === 0 handled above (same day)
  // diffDays < 0 shouldn't happen (time travel)

  stats.lastPlayDate = today;
  return true;
}

/**
 * Apply an event to weekly stats.
 * Resets weekly state if week changed.
 * @returns true if weekly stats were modified
 */
function applyWeeklyEvent(
  event: AchievementEvent,
  weeklyState: WeeklyChallengeState
): boolean {
  // Check if we need to reset for a new week
  const currentWeek = getCurrentWeekNumber();
  if (weeklyState.weekNumber !== currentWeek) {
    // New week - reset stats but keep history
    const challenge = getActiveWeeklyChallenge();
    weeklyState.weekNumber = currentWeek;
    weeklyState.challengeId = challenge.id;
    weeklyState.stats = createDefaultWeeklyStats();
    weeklyState.completed = false;
  }

  let modified = false;

  switch (event.type) {
    case 'TURN_COMPLETE': {
      if (event.is180) {
        weeklyState.stats.weekly180s++;
        modified = true;
      }
      break;
    }

    case 'THROW': {
      if (event.isBull) {
        weeklyState.stats.weeklyBulls++;
        modified = true;
      }
      if (event.isTriple) {
        weeklyState.stats.weeklyTriples++;
        modified = true;
      }
      break;
    }

    case 'GAME_COMPLETE': {
      if (event.won) {
        weeklyState.stats.weeklyWins++;
        modified = true;
      }
      break;
    }
  }

  return modified;
}

/**
 * Check if weekly challenge is now completed.
 * Unlocks 'weekly_challenge_complete' achievement on first completion.
 */
function checkWeeklyChallengeCompletion(
  weeklyState: WeeklyChallengeState,
  achievementsState: AchievementsState
): void {
  if (weeklyState.completed) {
    return; // Already completed this week
  }

  const challenge = WEEKLY_CHALLENGES.find((c) => c.id === weeklyState.challengeId);
  if (!challenge) {
    return;
  }

  const currentValue = weeklyState.stats[challenge.statKey];
  if (currentValue >= challenge.target) {
    weeklyState.completed = true;

    // Track completion in history
    if (!weeklyState.completedChallenges.includes(challenge.id)) {
      weeklyState.completedChallenges.push(challenge.id);
    }

    // Unlock the "Challenge Accepted" achievement on first ever completion
    if (weeklyState.completedChallenges.length === 1) {
      achievementsState.unlockedIds.add('weekly_challenge_complete');
    }
  }
}

/**
 * Evaluate all achievements against current stats.
 * @returns Array of newly unlocked achievement IDs
 */
export function evaluate(state: AchievementsState): string[] {
  const newUnlocks: string[] = [];

  for (const achievement of ACHIEVEMENTS) {
    // Skip if already unlocked
    if (state.unlockedIds.has(achievement.id)) {
      continue;
    }

    // Check if achievement is unlocked
    if (isAchievementUnlocked(achievement, state.stats)) {
      state.unlockedIds.add(achievement.id);
      newUnlocks.push(achievement.id);
    }
  }

  return newUnlocks;
}

/**
 * Check if a single achievement should be unlocked.
 */
function isAchievementUnlocked(
  achievement: typeof ACHIEVEMENTS[number],
  stats: StatsState
): boolean {
  // Achievements without statKey are event-triggered only
  // (e.g., weekly_challenge_complete is triggered directly)
  if (!achievement.statKey || achievement.target === undefined) {
    return false;
  }

  const currentValue = stats[achievement.statKey];

  if (achievement.isThreshold) {
    // Threshold: check if we've ever reached the target
    return currentValue >= achievement.target;
  } else {
    // Cumulative: check if total has reached target
    return currentValue >= achievement.target;
  }
}

// === Utility: Get Progress ===

/**
 * Get progress toward an achievement (for UI display).
 * @returns { current, target, percentage } or null if not trackable
 */
export function getAchievementProgress(
  achievementId: string,
  stats: StatsState
): { current: number; target: number; percentage: number } | null {
  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!achievement || !achievement.statKey || achievement.target === undefined) {
    return null;
  }

  const current = stats[achievement.statKey];
  const target = achievement.target;
  const percentage = Math.min(100, Math.floor((current / target) * 100));

  return { current, target, percentage };
}

/**
 * Get progress toward current weekly challenge.
 */
export function getWeeklyChallengeProgress(
  weeklyState: WeeklyChallengeState
): { current: number; target: number; percentage: number } | null {
  const challenge = WEEKLY_CHALLENGES.find((c) => c.id === weeklyState.challengeId);
  if (!challenge) {
    return null;
  }

  const current = weeklyState.stats[challenge.statKey];
  const target = challenge.target;
  const percentage = Math.min(100, Math.floor((current / target) * 100));

  return { current, target, percentage };
}
