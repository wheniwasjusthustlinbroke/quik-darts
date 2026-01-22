/**
 * Constants - Export all constants
 */

export * from './dartboard';
export * from './themes';

// Stake levels for wagered matches
export const STAKE_LEVELS = [50, 100, 500, 2500] as const;

// XP rewards
export const XP_REWARDS = {
  GAME_PLAYED: 10,
  GAME_WON: 25,
  GAME_WON_WAGERED: 50,
  ACHIEVEMENT_UNLOCKED: 15,
  DAILY_BONUS: 5,
} as const;

// Level thresholds
export const LEVEL_XP_REQUIREMENTS = [
  0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11000,
  15000, 20000, 27000, 35000, 45000, 57000, 71000, 87000, 105000, 125000,
] as const;

// Max levels
export const MAX_LEVEL = 99;

// Animation durations (ms)
export const ANIMATION = {
  DART_FLIGHT: 300,
  SCORE_POPUP: 1500,
  TURN_TRANSITION: 500,
  ACHIEVEMENT_POPUP: 3000,
} as const;

// Firebase paths
export const FIREBASE_PATHS = {
  USERS: 'users',
  PROFILES: 'profiles',
  WALLETS: 'wallets',
  PROGRESSION: 'progression',
  GAMES: 'games',
  MATCHMAKING_QUEUE: 'matchmaking_queue',
  ESCROW: 'escrow',
} as const;
