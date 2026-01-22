/**
 * Challenge Utilities
 *
 * Daily and weekly challenge management.
 */

import type { ChallengeDifficulty } from '../types';

// ============================================
// DAILY CHALLENGES POOL
// ============================================

export interface DailyChallengeTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  statKey: string;
  target: number;
  difficulty: ChallengeDifficulty;
}

export const DAILY_CHALLENGES_POOL: DailyChallengeTemplate[] = [
  // 180s challenges
  {
    id: 'daily_180_1',
    name: 'Maximum!',
    description: 'Hit 1 perfect 180',
    icon: '\u{1F4AF}',
    statKey: 'daily180s',
    target: 1,
    difficulty: 'easy',
  },
  {
    id: 'daily_180_3',
    name: 'Triple Maximum',
    description: 'Hit 3 perfect 180s',
    icon: '\u{1F4AF}',
    statKey: 'daily180s',
    target: 3,
    difficulty: 'medium',
  },
  {
    id: 'daily_180_5',
    name: '180 Machine',
    description: 'Hit 5 perfect 180s',
    icon: '\u{1F4AF}',
    statKey: 'daily180s',
    target: 5,
    difficulty: 'hard',
  },
  // Bullseye challenges
  {
    id: 'daily_bulls_5',
    name: 'Bullseye Starter',
    description: 'Hit 5 bullseyes',
    icon: '\u{1F3AF}',
    statKey: 'dailyBulls',
    target: 5,
    difficulty: 'easy',
  },
  {
    id: 'daily_bulls_15',
    name: 'Bulls on Target',
    description: 'Hit 15 bullseyes',
    icon: '\u{1F3AF}',
    statKey: 'dailyBulls',
    target: 15,
    difficulty: 'medium',
  },
  {
    id: 'daily_bulls_25',
    name: 'Bulls Eye Master',
    description: 'Hit 25 bullseyes',
    icon: '\u{1F3AF}',
    statKey: 'dailyBulls',
    target: 25,
    difficulty: 'hard',
  },
  // Win challenges
  {
    id: 'daily_wins_1',
    name: 'First Victory',
    description: 'Win 1 game',
    icon: '\u{1F3C6}',
    statKey: 'dailyWins',
    target: 1,
    difficulty: 'easy',
  },
  {
    id: 'daily_wins_3',
    name: 'Hat Trick',
    description: 'Win 3 games',
    icon: '\u{1F3C6}',
    statKey: 'dailyWins',
    target: 3,
    difficulty: 'medium',
  },
  {
    id: 'daily_wins_5',
    name: 'Winning Streak',
    description: 'Win 5 games',
    icon: '\u{1F3C6}',
    statKey: 'dailyWins',
    target: 5,
    difficulty: 'hard',
  },
  // Triple challenges
  {
    id: 'daily_triples_10',
    name: 'Triple Starter',
    description: 'Hit 10 triples',
    icon: '3\uFE0F\u20E3',
    statKey: 'dailyTriples',
    target: 10,
    difficulty: 'easy',
  },
  {
    id: 'daily_triples_25',
    name: 'Triple Threat',
    description: 'Hit 25 triples',
    icon: '3\uFE0F\u20E3',
    statKey: 'dailyTriples',
    target: 25,
    difficulty: 'medium',
  },
  {
    id: 'daily_triples_50',
    name: 'Triple Master',
    description: 'Hit 50 triples',
    icon: '3\uFE0F\u20E3',
    statKey: 'dailyTriples',
    target: 50,
    difficulty: 'hard',
  },
];

// ============================================
// WEEKLY CHALLENGES
// ============================================

export interface WeeklyChallengeTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  statKey: string;
  target: number;
  week: number;
  reward: string;
}

export const TIME_LIMITED_ACHIEVEMENTS: WeeklyChallengeTemplate[] = [
  {
    id: 'weekly_180_sprint',
    name: 'Maximum Week',
    description: 'Hit 10 perfect 180s this week',
    icon: '\u{1F4AF}',
    rarity: 'rare',
    statKey: 'weekly180s',
    target: 10,
    week: 1,
    reward: '180 Master Badge',
  },
  {
    id: 'weekly_bulls_blitz',
    name: 'Bulls Week',
    description: 'Hit 25 bullseyes this week',
    icon: '\u{1F3AF}',
    rarity: 'rare',
    statKey: 'weeklyBulls',
    target: 25,
    week: 2,
    reward: 'Bullseye Badge',
  },
  {
    id: 'weekly_win_streak',
    name: 'Victory Week',
    description: 'Win 10 games this week',
    icon: '\u{1F3C6}',
    rarity: 'rare',
    statKey: 'weeklyWins',
    target: 10,
    week: 3,
    reward: 'Champion Badge',
  },
  {
    id: 'weekly_triple_threat',
    name: 'Triples Week',
    description: 'Hit 50 triples this week',
    icon: '3\uFE0F\u20E3',
    rarity: 'rare',
    statKey: 'weeklyTriples',
    target: 50,
    week: 4,
    reward: 'Triple Badge',
  },
];

// ============================================
// CHALLENGE FUNCTIONS
// ============================================

/**
 * Get the current week number (1-4, rotating)
 */
export function getCurrentWeekNumber(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 +
      startOfYear.getDay() +
      1) /
      7
  );
  return ((weekNumber - 1) % 4) + 1;
}

/**
 * Get the active time-limited achievement for the current week
 */
export function getActiveTimeLimitedAchievement(): WeeklyChallengeTemplate | undefined {
  const currentWeek = getCurrentWeekNumber();
  return TIME_LIMITED_ACHIEVEMENTS.find((a) => a.week === currentWeek);
}

/**
 * Get milliseconds until weekly reset (next Sunday midnight)
 */
export function getTimeUntilWeeklyReset(): number {
  const now = new Date();
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + (7 - now.getDay()));
  nextSunday.setHours(0, 0, 0, 0);
  return nextSunday.getTime() - now.getTime();
}

/**
 * Generate deterministic daily challenges based on date
 * Uses date as seed for consistent challenges per day
 */
export function generateDailyChallenges(
  dateString: string
): DailyChallengeTemplate[] {
  // Use date components as seed for deterministic shuffle
  const seed = dateString
    .split('-')
    .reduce((acc, val) => acc + parseInt(val, 10), 0);

  const shuffled = [...DAILY_CHALLENGES_POOL].sort((a, b) => {
    const hashA = ((seed * 31 + a.id.charCodeAt(0)) % 1000);
    const hashB = ((seed * 31 + b.id.charCodeAt(0)) % 1000);
    return hashA - hashB;
  });

  // Pick one of each difficulty
  const easy = shuffled.find((c) => c.difficulty === 'easy');
  const medium = shuffled.find((c) => c.difficulty === 'medium');
  const hard = shuffled.find((c) => c.difficulty === 'hard');

  return [easy, medium, hard].filter(
    (c): c is DailyChallengeTemplate => c !== undefined
  );
}

// ============================================
// CHALLENGE DATA STRUCTURES
// ============================================

export interface DailyChallengeStats {
  daily180s: number;
  dailyBulls: number;
  dailyWins: number;
  dailyGames: number;
  dailyTriples: number;
  dailyScore: number;
}

export interface DailyChallengeData {
  date: string;
  challenges: DailyChallengeTemplate[];
  stats: DailyChallengeStats;
  completedChallenges: string[];
}

export interface WeeklyChallengeStats {
  weekly180s: number;
  weeklyBulls: number;
  weeklyWins: number;
  weeklyTriples: number;
}

export interface WeeklyChallengeData {
  weekNumber: number;
  challengeId?: string;
  stats: WeeklyChallengeStats;
  completed: boolean;
  completedChallenges: string[];
}

/**
 * Create default daily challenge data for a given date
 */
export function createDefaultDailyChallengeData(
  dateString: string
): DailyChallengeData {
  return {
    date: dateString,
    challenges: generateDailyChallenges(dateString),
    stats: {
      daily180s: 0,
      dailyBulls: 0,
      dailyWins: 0,
      dailyGames: 0,
      dailyTriples: 0,
      dailyScore: 0,
    },
    completedChallenges: [],
  };
}

/**
 * Create default weekly challenge data for a given week
 */
export function createDefaultWeeklyChallengeData(
  weekNumber: number
): WeeklyChallengeData {
  return {
    weekNumber,
    challengeId: TIME_LIMITED_ACHIEVEMENTS.find((a) => a.week === weekNumber)
      ?.id,
    stats: {
      weekly180s: 0,
      weeklyBulls: 0,
      weeklyWins: 0,
      weeklyTriples: 0,
    },
    completed: false,
    completedChallenges: [],
  };
}

/**
 * Validate daily challenge data structure
 */
export function isValidDailyChallengeData(
  data: unknown
): data is DailyChallengeData {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.date !== 'string') return false;
  if (!Array.isArray(obj.challenges)) return false;
  if (!obj.stats || typeof obj.stats !== 'object') return false;
  if (!Array.isArray(obj.completedChallenges)) return false;

  // Validate each challenge has required fields
  for (const challenge of obj.challenges as unknown[]) {
    if (!challenge || typeof challenge !== 'object') return false;
    const c = challenge as Record<string, unknown>;
    if (!c.id || !c.statKey || typeof c.target !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Validate weekly challenge data structure
 */
export function isValidWeeklyChallengeData(
  data: unknown
): data is WeeklyChallengeData {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.weekNumber !== 'number') return false;
  if (!obj.stats || typeof obj.stats !== 'object') return false;
  if (typeof obj.completed !== 'boolean') return false;
  if (!Array.isArray(obj.completedChallenges)) return false;

  return true;
}

/**
 * Get coin reward for challenge difficulty
 */
export function getChallengeReward(difficulty: ChallengeDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return 25;
    case 'medium':
      return 50;
    case 'hard':
      return 100;
    default:
      return 25;
  }
}
