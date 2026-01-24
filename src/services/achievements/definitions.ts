/**
 * Achievement Definitions
 *
 * All permanent achievements and weekly challenges.
 * Parity with index.html + new wagered/engagement categories.
 */

import {
  AchievementDefinition,
  WeeklyChallengeDefinition,
} from './types';

// === Permanent Achievements ===

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // ─────────────────────────────────────────────────────────────
  // FIRST STEPS (standalone)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'first_game',
    name: 'First Steps',
    description: 'Every champion starts somewhere. Complete your first game.',
    icon: '🎯',
    rarity: 'common',
    mode: 'any',
    statKey: 'totalGamesPlayed',
    target: 1,
  },
  {
    id: 'first_win',
    name: 'First Victory',
    description: 'The taste of victory never gets old. Win your first game.',
    icon: '🏆',
    rarity: 'common',
    mode: 'any',
    statKey: 'totalGamesWon',
    target: 1,
  },

  // ─────────────────────────────────────────────────────────────
  // MAXIMUM! CHAIN - 180 progression
  // ─────────────────────────────────────────────────────────────
  {
    id: 'first_180',
    name: 'Maximum! I',
    description: 'The crowd goes wild! Hit your first perfect 180.',
    icon: '💯',
    rarity: 'uncommon',
    mode: 'any',
    statKey: 'total180s',
    target: 1,
    chain: 'maximum',
    tier: 1,
  },
  {
    id: 'ten_180s',
    name: 'Maximum! II',
    description: 'Consistency is key. Land 10 maximum scores.',
    icon: '💯',
    rarity: 'rare',
    mode: 'any',
    statKey: 'total180s',
    target: 10,
    chain: 'maximum',
    tier: 2,
  },
  {
    id: 'fifty_180s',
    name: 'Maximum! III',
    description: 'Only the elite reach this level. Hit 50 perfect 180s.',
    icon: '💯',
    rarity: 'epic',
    mode: 'any',
    statKey: 'total180s',
    target: 50,
    chain: 'maximum',
    tier: 3,
  },
  {
    id: 'hundred_180s',
    name: 'Maximum! IV',
    description: 'Legendary precision. 100 perfect 180s.',
    icon: '💯',
    rarity: 'legendary',
    mode: 'any',
    statKey: 'total180s',
    target: 100,
    chain: 'maximum',
    tier: 4,
  },

  // ─────────────────────────────────────────────────────────────
  // BULLSEYE! CHAIN
  // ─────────────────────────────────────────────────────────────
  {
    id: 'first_bull',
    name: 'Bullseye! I',
    description: 'Right in the center! Hit your first bullseye.',
    icon: '🎯',
    rarity: 'common',
    mode: 'any',
    statKey: 'totalBulls',
    target: 1,
    chain: 'bullseye',
    tier: 1,
  },
  {
    id: 'fifty_bulls',
    name: 'Bullseye! II',
    description: 'Precision personified. Find the bullseye 50 times.',
    icon: '🎯',
    rarity: 'rare',
    mode: 'any',
    statKey: 'totalBulls',
    target: 50,
    chain: 'bullseye',
    tier: 2,
  },
  {
    id: 'hundred_bulls',
    name: 'Bullseye! III',
    description: 'The center is your home. 100 bullseyes and counting.',
    icon: '🎯',
    rarity: 'epic',
    mode: 'any',
    statKey: 'totalBulls',
    target: 100,
    chain: 'bullseye',
    tier: 3,
  },
  {
    id: 'twofifty_bulls',
    name: 'Bullseye! IV',
    description: 'Master of the center. 250 bullseyes.',
    icon: '🎯',
    rarity: 'legendary',
    mode: 'any',
    statKey: 'totalBulls',
    target: 250,
    chain: 'bullseye',
    tier: 4,
  },

  // ─────────────────────────────────────────────────────────────
  // CHECKOUT CHAIN (threshold-based)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'checkout_100',
    name: 'Checkout I',
    description: 'Nerves of steel. Checkout 100+ in one visit.',
    icon: '✅',
    rarity: 'uncommon',
    mode: 'any',
    statKey: 'highestCheckout',
    target: 100,
    isThreshold: true,
    chain: 'checkout',
    tier: 1,
  },
  {
    id: 'checkout_150',
    name: 'Checkout II',
    description: 'The impossible made possible. Checkout 150+ points.',
    icon: '✅',
    rarity: 'rare',
    mode: 'any',
    statKey: 'highestCheckout',
    target: 150,
    isThreshold: true,
    chain: 'checkout',
    tier: 2,
  },
  {
    id: 'checkout_170',
    name: 'Checkout III',
    description: 'The ultimate finish. Checkout 170 - the maximum.',
    icon: '✅',
    rarity: 'legendary',
    mode: 'any',
    statKey: 'highestCheckout',
    target: 170,
    isThreshold: true,
    chain: 'checkout',
    tier: 3,
  },

  // ─────────────────────────────────────────────────────────────
  // TRIPLE CHAIN
  // ─────────────────────────────────────────────────────────────
  {
    id: 'fifty_triples',
    name: 'Triple I',
    description: 'Treble trouble for opponents. Hit 50 triples.',
    icon: '3️⃣',
    rarity: 'uncommon',
    mode: 'any',
    statKey: 'totalTriples',
    target: 50,
    chain: 'triple',
    tier: 1,
  },
  {
    id: 'two_hundred_triples',
    name: 'Triple II',
    description: 'The triple 20 is your playground. 200 triples.',
    icon: '3️⃣',
    rarity: 'rare',
    mode: 'any',
    statKey: 'totalTriples',
    target: 200,
    chain: 'triple',
    tier: 2,
  },
  {
    id: 'five_hundred_triples',
    name: 'Triple III',
    description: 'Triple mastery achieved. 500 triples.',
    icon: '3️⃣',
    rarity: 'epic',
    mode: 'any',
    statKey: 'totalTriples',
    target: 500,
    chain: 'triple',
    tier: 3,
  },

  // ─────────────────────────────────────────────────────────────
  // VICTORY CHAIN
  // ─────────────────────────────────────────────────────────────
  {
    id: 'five_wins',
    name: 'Victory I',
    description: "You're heating up! Claim 5 victories.",
    icon: '🏆',
    rarity: 'uncommon',
    mode: 'any',
    statKey: 'totalGamesWon',
    target: 5,
    chain: 'victory',
    tier: 1,
  },
  {
    id: 'twenty_wins',
    name: 'Victory II',
    description: 'They fear your name. Dominate with 20 wins.',
    icon: '🏆',
    rarity: 'rare',
    mode: 'any',
    statKey: 'totalGamesWon',
    target: 20,
    chain: 'victory',
    tier: 2,
  },
  {
    id: 'fifty_wins',
    name: 'Victory III',
    description: 'A true champion emerges. Conquer 50 games.',
    icon: '🏆',
    rarity: 'epic',
    mode: 'any',
    statKey: 'totalGamesWon',
    target: 50,
    chain: 'victory',
    tier: 3,
  },
  {
    id: 'hundred_wins',
    name: 'Victory IV',
    description: 'Unstoppable force. 100 victories.',
    icon: '🏆',
    rarity: 'legendary',
    mode: 'any',
    statKey: 'totalGamesWon',
    target: 100,
    chain: 'victory',
    tier: 4,
  },

  // ─────────────────────────────────────────────────────────────
  // PERFECT 9 CHAIN (nine-darter milestones)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'perfect9_first',
    name: 'Perfect 9',
    description: 'The holy grail of darts. Complete a leg with 9 perfect darts.',
    icon: '👑',
    rarity: 'legendary',
    mode: 'any',
    statKey: 'totalNineDarters',
    target: 1,
    chain: 'perfect9',
    tier: 1,
  },
  {
    id: 'perfect9_ten',
    name: 'Perfect 9 Master',
    description: 'Lightning strikes twice... and again. Complete 10 nine-darters.',
    icon: '👑',
    rarity: 'mythic',
    mode: 'any',
    statKey: 'totalNineDarters',
    target: 10,
    chain: 'perfect9',
    tier: 2,
  },
  {
    id: 'perfect9_hundred',
    name: 'Perfect 9 Legend',
    description: 'Perfection personified. Complete 100 nine-darters.',
    icon: '👑',
    rarity: 'mythic',
    mode: 'any',
    statKey: 'totalNineDarters',
    target: 100,
    chain: 'perfect9',
    tier: 3,
  },

  // ─────────────────────────────────────────────────────────────
  // GLOBAL CHAIN - Online progression
  // ─────────────────────────────────────────────────────────────
  {
    id: 'first_online',
    name: 'Global I',
    description: 'Step into the arena. Face your first online opponent.',
    icon: '🌍',
    rarity: 'common',
    mode: 'online',
    statKey: 'totalOnlineGames',
    target: 1,
    chain: 'global',
    tier: 1,
  },
  {
    id: 'first_online_win',
    name: 'Global II',
    description: 'Real opponents, real pressure, real victory.',
    icon: '🌍',
    rarity: 'uncommon',
    mode: 'online',
    statKey: 'totalOnlineWins',
    target: 1,
    chain: 'global',
    tier: 2,
  },
  {
    id: 'ten_online_wins',
    name: 'Global III',
    description: 'Battle-tested. Defeat 10 online challengers.',
    icon: '🌍',
    rarity: 'rare',
    mode: 'online',
    statKey: 'totalOnlineWins',
    target: 10,
    chain: 'global',
    tier: 3,
  },
  {
    id: 'fifty_online_wins',
    name: 'Global IV',
    description: 'World-class competitor. 50 online victories.',
    icon: '🌍',
    rarity: 'epic',
    mode: 'online',
    statKey: 'totalOnlineWins',
    target: 50,
    chain: 'global',
    tier: 4,
  },

  // ─────────────────────────────────────────────────────────────
  // HIGH STAKES CHAIN - Wagered matches (NEW)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'first_wagered_win',
    name: 'High Stakes I',
    description: 'Fortune favors the bold. Win your first wagered match.',
    icon: '💰',
    rarity: 'uncommon',
    mode: 'online',
    statKey: 'totalWageredWins',
    target: 1,
    chain: 'highstakes',
    tier: 1,
  },
  {
    id: 'ten_wagered_wins',
    name: 'High Stakes II',
    description: 'A consistent winner. 10 wagered victories.',
    icon: '💰',
    rarity: 'rare',
    mode: 'online',
    statKey: 'totalWageredWins',
    target: 10,
    chain: 'highstakes',
    tier: 2,
  },
  {
    id: 'fifty_wagered_wins',
    name: 'High Stakes III',
    description: 'The house fears you. 50 wagered wins.',
    icon: '💰',
    rarity: 'epic',
    mode: 'online',
    statKey: 'totalWageredWins',
    target: 50,
    chain: 'highstakes',
    tier: 3,
  },

  // ─────────────────────────────────────────────────────────────
  // PROFIT CHAIN - Wagered earnings (NEW)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'profit_1k',
    name: 'Profit I',
    description: 'Money talks. Earn 1,000 net coins from wagered matches.',
    icon: '📈',
    rarity: 'rare',
    mode: 'online',
    statKey: 'totalWageredProfit',
    target: 1000,
    chain: 'profit',
    tier: 1,
  },
  {
    id: 'profit_10k',
    name: 'Profit II',
    description: 'A small fortune. 10,000 net coins earned.',
    icon: '📈',
    rarity: 'epic',
    mode: 'online',
    statKey: 'totalWageredProfit',
    target: 10000,
    chain: 'profit',
    tier: 2,
  },
  {
    id: 'profit_100k',
    name: 'Profit III',
    description: 'Darts tycoon. 100,000 net coins earned.',
    icon: '📈',
    rarity: 'legendary',
    mode: 'online',
    statKey: 'totalWageredProfit',
    target: 100000,
    chain: 'profit',
    tier: 3,
  },

  // ─────────────────────────────────────────────────────────────
  // DEDICATED CHAIN - Daily streaks (NEW)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'daily_streak_3',
    name: 'Dedicated I',
    description: 'Building a habit. Play 3 days in a row.',
    icon: '🔥',
    rarity: 'uncommon',
    mode: 'any',
    statKey: 'currentDailyStreak',
    target: 3,
    isThreshold: true,
    chain: 'dedicated',
    tier: 1,
  },
  {
    id: 'daily_streak_7',
    name: 'Dedicated II',
    description: 'A full week of darts. 7-day streak.',
    icon: '🔥',
    rarity: 'rare',
    mode: 'any',
    statKey: 'currentDailyStreak',
    target: 7,
    isThreshold: true,
    chain: 'dedicated',
    tier: 2,
  },
  {
    id: 'daily_streak_30',
    name: 'Dedicated III',
    description: 'True dedication. 30-day streak achieved.',
    icon: '🔥',
    rarity: 'epic',
    mode: 'any',
    statKey: 'currentDailyStreak',
    target: 30,
    isThreshold: true,
    chain: 'dedicated',
    tier: 3,
  },

  // ─────────────────────────────────────────────────────────────
  // WEEKLY CHALLENGE (standalone) (NEW)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'weekly_challenge_complete',
    name: 'Challenge Accepted',
    description: 'Complete your first weekly challenge.',
    icon: '📅',
    rarity: 'rare',
    mode: 'any',
  },
];

// === Weekly Challenges (4-week rotation) ===

export const WEEKLY_CHALLENGES: WeeklyChallengeDefinition[] = [
  // Week 1 - 180 Focus
  {
    id: 'weekly_180_sprint',
    name: 'Maximum Week',
    description: 'Hit 10 perfect 180s this week',
    icon: '💯',
    rarity: 'rare',
    statKey: 'weekly180s',
    target: 10,
    week: 1,
    reward: '180 Master Badge',
  },
  // Week 2 - Bullseye Focus
  {
    id: 'weekly_bulls_blitz',
    name: 'Bulls Week',
    description: 'Hit 25 bullseyes this week',
    icon: '🎯',
    rarity: 'rare',
    statKey: 'weeklyBulls',
    target: 25,
    week: 2,
    reward: 'Bullseye Badge',
  },
  // Week 3 - Victory Focus
  {
    id: 'weekly_win_streak',
    name: 'Victory Week',
    description: 'Win 10 games this week',
    icon: '🏆',
    rarity: 'rare',
    statKey: 'weeklyWins',
    target: 10,
    week: 3,
    reward: 'Champion Badge',
  },
  // Week 4 - Triples Focus
  {
    id: 'weekly_triple_threat',
    name: 'Triples Week',
    description: 'Hit 50 triples this week',
    icon: '3️⃣',
    rarity: 'rare',
    statKey: 'weeklyTriples',
    target: 50,
    week: 4,
    reward: 'Triple Badge',
  },
];

// === Lookup Helpers ===

/** Map of achievement ID to definition for O(1) lookup */
export const ACHIEVEMENTS_BY_ID = new Map<string, AchievementDefinition>(
  ACHIEVEMENTS.map((a) => [a.id, a])
);

// TODO: Replace with UTC weekStart-based calculation (Monday 00:00 UTC)
// Current implementation is temporary during migration
/** Get current week number (1-4 rotation) */
export function getCurrentWeekNumber(): 1 | 2 | 3 | 4 {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const daysSinceStart = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
  return (((weekNumber - 1) % 4) + 1) as 1 | 2 | 3 | 4;
}

/** Get the active weekly challenge for the current week */
export function getActiveWeeklyChallenge(): WeeklyChallengeDefinition {
  const week = getCurrentWeekNumber();
  return WEEKLY_CHALLENGES.find((c) => c.week === week)!;
}
