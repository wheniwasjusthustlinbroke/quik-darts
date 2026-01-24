/**
 * Achievement Storage
 *
 * localStorage persistence for achievements and weekly challenges.
 * Parity with index.html storage keys.
 */

import {
  AchievementsState,
  WeeklyChallengeState,
  StatsState,
  WeeklyStatsState,
  ACHIEVEMENTS_SCHEMA_VERSION,
  WEEKLY_CHALLENGE_SCHEMA_VERSION,
} from './types';
import {
  createDefaultAchievementsState,
  createDefaultWeeklyChallengeState,
  createDefaultStats,
  createDefaultWeeklyStats,
} from './engine';

// === Constants ===

/** Max processedEventIds to retain (must match engine.ts) */
const MAX_PROCESSED_EVENTS = 5000;

// === Storage Keys (parity with index.html) ===

const STORAGE_KEYS = {
  achievements: 'quikdarts_achievements',
  stats: 'quikdarts_stats',
  weeklyChallenge: 'quikdarts_weekly_challenge',
  processedEvents: 'quikdarts_processed_events',
} as const;

// === Serialization Types (for JSON storage) ===

interface SerializedWeeklyChallengeState {
  schemaVersion?: number;
  weekNumber: number;
  challengeId: string | null;
  stats: WeeklyStatsState;
  completed: boolean;
  completedChallenges: string[];
}

// === Load Functions ===

/**
 * Load achievements state from localStorage.
 * Returns default state if not found or invalid.
 */
export function loadAchievementsState(): AchievementsState {
  try {
    // Load unlocked achievements (parity with index.html)
    const achievementsJson = localStorage.getItem(STORAGE_KEYS.achievements);
    const parsedAchievements = achievementsJson ? JSON.parse(achievementsJson) : null;
    const unlockedIds = Array.isArray(parsedAchievements)
      ? new Set<string>(parsedAchievements)
      : new Set<string>();

    // Load stats (parity with index.html)
    const statsJson = localStorage.getItem(STORAGE_KEYS.stats);
    const parsedStats = statsJson ? JSON.parse(statsJson) : null;

    // Schema version check for stats
    const statsSchemaVersion = parsedStats?.schemaVersion ?? 0;
    if (statsSchemaVersion > ACHIEVEMENTS_SCHEMA_VERSION) {
      // Future/invalid schema - reset to defaults
      console.warn('[achievements/storage] Stats schema version is from future, resetting');
      return createDefaultAchievementsState();
    }

    const stats: StatsState = parsedStats
      ? migrateStats(parsedStats)
      : createDefaultStats();

    // Load processed event IDs (new - not in index.html)
    const processedJson = localStorage.getItem(STORAGE_KEYS.processedEvents);
    const parsedProcessed = processedJson ? JSON.parse(processedJson) : null;
    const processedEventIds = Array.isArray(parsedProcessed)
      ? new Set<string>(parsedProcessed)
      : new Set<string>();

    // Cap processedEventIds to prevent unbounded growth
    const ids = Array.from(processedEventIds);
    if (ids.length > MAX_PROCESSED_EVENTS) {
      const overflow = ids.length - MAX_PROCESSED_EVENTS;
      for (let i = 0; i < overflow; i++) {
        processedEventIds.delete(ids[i]);
      }
    }

    return {
      schemaVersion: ACHIEVEMENTS_SCHEMA_VERSION,
      unlockedIds,
      stats,
      processedEventIds,
    };
  } catch (error) {
    console.error('[achievements/storage] Failed to load achievements state:', error);
    return createDefaultAchievementsState();
  }
}

/**
 * Load weekly challenge state from localStorage.
 * Returns default state if not found or invalid.
 */
export function loadWeeklyChallengeState(): WeeklyChallengeState {
  try {
    const json = localStorage.getItem(STORAGE_KEYS.weeklyChallenge);
    if (!json) {
      return createDefaultWeeklyChallengeState();
    }

    const data: SerializedWeeklyChallengeState = JSON.parse(json);

    // Schema version check
    const storedVersion = data.schemaVersion ?? 0;
    if (storedVersion > WEEKLY_CHALLENGE_SCHEMA_VERSION) {
      // Future/invalid schema - reset to defaults
      console.warn('[achievements/storage] Weekly challenge schema version is from future, resetting');
      return createDefaultWeeklyChallengeState();
    }

    // Migration: add missing fields from older versions
    return {
      schemaVersion: WEEKLY_CHALLENGE_SCHEMA_VERSION,
      weekNumber: data.weekNumber ?? 1,
      challengeId: data.challengeId ?? null,
      stats: data.stats ?? createDefaultWeeklyStats(),
      completed: data.completed ?? false,
      completedChallenges: Array.isArray(data.completedChallenges)
        ? data.completedChallenges
        : [],
    };
  } catch (error) {
    console.error('[achievements/storage] Failed to load weekly challenge state:', error);
    return createDefaultWeeklyChallengeState();
  }
}

// === Save Functions ===

/**
 * Save achievements state to localStorage.
 */
export function saveAchievementsState(state: AchievementsState): void {
  try {
    // Save unlocked achievements (parity with index.html)
    localStorage.setItem(
      STORAGE_KEYS.achievements,
      JSON.stringify(Array.from(state.unlockedIds))
    );

    // Save stats (parity with index.html)
    localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(state.stats));

    // Save processed event IDs (new - not in index.html)
    localStorage.setItem(
      STORAGE_KEYS.processedEvents,
      JSON.stringify(Array.from(state.processedEventIds))
    );
  } catch (error) {
    console.error('[achievements/storage] Failed to save achievements state:', error);
  }
}

/**
 * Save weekly challenge state to localStorage.
 */
export function saveWeeklyChallengeState(state: WeeklyChallengeState): void {
  try {
    const serialized: SerializedWeeklyChallengeState = {
      schemaVersion: state.schemaVersion,
      weekNumber: state.weekNumber,
      challengeId: state.challengeId,
      stats: state.stats,
      completed: state.completed,
      completedChallenges: state.completedChallenges,
    };
    localStorage.setItem(STORAGE_KEYS.weeklyChallenge, JSON.stringify(serialized));
  } catch (error) {
    console.error('[achievements/storage] Failed to save weekly challenge state:', error);
  }
}

// === Migration ===

/**
 * Migrate stats from older schema versions.
 * Adds new fields with default values.
 */
function migrateStats(raw: Partial<StatsState>): StatsState {
  const defaults = createDefaultStats();
  return {
    // Games (parity with index.html)
    totalGamesPlayed: raw.totalGamesPlayed ?? defaults.totalGamesPlayed,
    totalGamesWon: raw.totalGamesWon ?? defaults.totalGamesWon,
    totalOnlineGames: raw.totalOnlineGames ?? defaults.totalOnlineGames,
    totalOnlineWins: raw.totalOnlineWins ?? defaults.totalOnlineWins,

    // Wagered (new fields)
    totalWageredGames: raw.totalWageredGames ?? defaults.totalWageredGames,
    totalWageredWins: raw.totalWageredWins ?? defaults.totalWageredWins,
    totalWageredProfit: raw.totalWageredProfit ?? defaults.totalWageredProfit,

    // Skill (parity with index.html)
    total180s: raw.total180s ?? defaults.total180s,
    totalNineDarters: raw.totalNineDarters ?? defaults.totalNineDarters,
    totalBulls: raw.totalBulls ?? defaults.totalBulls,
    totalTriples: raw.totalTriples ?? defaults.totalTriples,
    highestCheckout: raw.highestCheckout ?? defaults.highestCheckout,

    // Engagement (new fields)
    currentDailyStreak: raw.currentDailyStreak ?? defaults.currentDailyStreak,
    longestDailyStreak: raw.longestDailyStreak ?? defaults.longestDailyStreak,
    lastPlayDate: raw.lastPlayDate ?? defaults.lastPlayDate,
  };
}

// === Utility ===

/**
 * Clear all achievement data from localStorage.
 * Use with caution - for testing/reset only.
 */
export function clearAllAchievementData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.achievements);
    localStorage.removeItem(STORAGE_KEYS.stats);
    localStorage.removeItem(STORAGE_KEYS.weeklyChallenge);
    localStorage.removeItem(STORAGE_KEYS.processedEvents);
  } catch (error) {
    console.error('[achievements/storage] Failed to clear achievement data:', error);
  }
}
