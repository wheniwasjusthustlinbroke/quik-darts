/**
 * Achievement System Types
 *
 * Event-based architecture with explicit eventId for idempotency.
 * Events are keyed by { matchId, legId?, eventType, index? } to prevent double-counting.
 */

// === Event Types ===

/**
 * Base event interface - all events have an explicit eventId for deduplication.
 * eventId format: "${matchId}:${legId}:${eventType}:${index}" (components omitted if not applicable)
 */
export interface BaseEvent {
  eventId: string;
  ts: number; // Unix timestamp
}

export interface GameCompleteEvent extends BaseEvent {
  type: 'GAME_COMPLETE';
  matchId: string;
  won: boolean;
  isOnline: boolean;
  isWagered: boolean;
}

export interface LegCompleteEvent extends BaseEvent {
  type: 'LEG_COMPLETE';
  matchId: string;
  legId: string;
  dartsUsed: number; // 9 = nine-darter
  won: boolean;
}

export interface ThrowEvent extends BaseEvent {
  type: 'THROW';
  matchId: string;
  legId: string;
  throwIndex: number; // 0-based index within the leg
  score: number;
  segment: string; // 'T20', 'D16', 'BULL', '25', '1', etc.
  multiplier: number; // 1, 2 (double), 3 (triple)
  isBull: boolean;
  isTriple: boolean;
}

export interface TurnCompleteEvent extends BaseEvent {
  type: 'TURN_COMPLETE';
  matchId: string;
  legId: string;
  turnIndex: number;
  turnScore: number;
  is180: boolean;
}

export interface CheckoutEvent extends BaseEvent {
  type: 'CHECKOUT';
  matchId: string;
  legId: string;
  checkoutValue: number; // Points finished on (e.g., 170)
}

export interface WageredPayoutEvent extends BaseEvent {
  type: 'WAGERED_PAYOUT';
  matchId: string;
  payout: number; // Gross payout received
  stake: number; // Original stake (for net profit calculation)
}

export interface DailyLoginEvent extends BaseEvent {
  type: 'DAILY_LOGIN';
  date: string; // YYYY-MM-DD format
}

export type AchievementEvent =
  | GameCompleteEvent
  | LegCompleteEvent
  | ThrowEvent
  | TurnCompleteEvent
  | CheckoutEvent
  | WageredPayoutEvent
  | DailyLoginEvent;

// === Achievement Definition ===

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type AchievementMode = 'offline' | 'online' | 'any';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji
  rarity: AchievementRarity;
  mode: AchievementMode; // Which game modes count toward this achievement

  // Progress tracking
  statKey?: keyof StatsState; // Stat to track for progress
  target?: number; // Target value to unlock
  isThreshold?: boolean; // true = "reach X once", false = "accumulate X total"

  // Chain grouping (for tiered achievements like Maximum! I-IV)
  chain?: string;
  tier?: number;
}

export interface WeeklyChallengeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  statKey: keyof WeeklyStatsState;
  target: number;
  week: 1 | 2 | 3 | 4; // Which week in the 4-week rotation
  reward: string; // Badge name or description
}

// === Stats State ===

/**
 * Cumulative stats (persisted, never reset).
 * Used for permanent achievement progress tracking.
 */
export interface StatsState {
  // Games
  totalGamesPlayed: number;
  totalGamesWon: number;
  totalOnlineGames: number;
  totalOnlineWins: number;

  // Wagered
  totalWageredGames: number;
  totalWageredWins: number;
  totalWageredProfit: number; // Net profit (payouts minus stakes)

  // Skill
  total180s: number;
  totalNineDarters: number;
  totalBulls: number;
  totalTriples: number;
  highestCheckout: number; // Threshold stat (max ever achieved)

  // Engagement
  currentDailyStreak: number;
  longestDailyStreak: number;
  lastPlayDate: string | null; // YYYY-MM-DD
}

/**
 * Weekly stats (reset each week).
 * Used for weekly challenge progress tracking.
 */
export interface WeeklyStatsState {
  weekly180s: number;
  weeklyBulls: number;
  weeklyWins: number;
  weeklyTriples: number;
}

// === Achievements State ===

/** Current schema version for migration safety */
export const ACHIEVEMENTS_SCHEMA_VERSION = 1;
export const WEEKLY_CHALLENGE_SCHEMA_VERSION = 1;

/**
 * Per-user achievement state (persisted).
 */
export interface AchievementsState {
  schemaVersion: number;

  // Set of unlocked achievement IDs
  unlockedIds: Set<string>;

  // Cumulative stats for progress tracking
  stats: StatsState;

  // Set of processed eventIds (for idempotency)
  processedEventIds: Set<string>;
}

/**
 * Weekly challenge state (persisted, reset each week).
 */
export interface WeeklyChallengeState {
  schemaVersion: number;

  weekNumber: number; // Current week (1-4)
  challengeId: string | null; // Active challenge ID
  stats: WeeklyStatsState;
  completed: boolean;
  completedChallenges: string[]; // History of completed challenge IDs
}

// === Engine Output ===

export interface EvaluationResult {
  newUnlocks: string[]; // Achievement IDs unlocked by this event
  statsUpdated: boolean;
  weeklyProgressUpdated: boolean;
}

// === Helper: Create eventId ===

/**
 * Generate collision-safe eventId for deduplication.
 * Format: matchId:legId:eventType:index (components omitted if not applicable)
 */
export function createEventId(
  matchId: string,
  eventType: AchievementEvent['type'],
  legId?: string,
  index?: number
): string {
  const parts: string[] = [matchId];
  if (legId !== undefined) parts.push(legId);
  parts.push(eventType);
  if (index !== undefined) parts.push(String(index));
  return parts.join(':');
}
