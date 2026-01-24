/**
 * Achievement System
 *
 * Event-based achievement tracking with idempotency.
 */

// Types
export * from './types';

// Definitions
export {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  WEEKLY_CHALLENGES,
  getCurrentWeekNumber,
  getActiveWeeklyChallenge,
} from './definitions';

// Engine
export {
  createDefaultStats,
  createDefaultWeeklyStats,
  createDefaultAchievementsState,
  createDefaultWeeklyChallengeState,
  recordEvent,
  evaluate,
  getAchievementProgress,
  getWeeklyChallengeProgress,
} from './engine';

// Storage
export {
  loadAchievementsState,
  loadWeeklyChallengeState,
  saveAchievementsState,
  saveWeeklyChallengeState,
  clearAllAchievementData,
} from './storage';
