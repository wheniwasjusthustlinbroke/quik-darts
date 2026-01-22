/**
 * Quik Darts - TypeScript Type Definitions
 *
 * All types for the game, organized by domain.
 */

// ============================================
// GAME STATES
// ============================================

export type GameState =
  | 'landing'
  | 'setup'
  | 'playing'
  | 'gameOver'
  | 'practice'
  | 'achievements'
  | 'profile';

export type MatchmakingState =
  | null
  | 'searching'
  | 'found'
  | 'playing';

// ============================================
// PLAYER TYPES
// ============================================

export interface Player {
  id: string;
  name: string;
  score: number;
  isAI: boolean;
  aiDifficulty?: AIDifficulty | null;
  flag: string;
  avatar?: string | null;
  level?: number;
}

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface PlayerSetup {
  count: number;
  names: string[];
  gameMode: GameMode;
  aiPlayers: boolean[];
  aiDifficulty: (AIDifficulty | null)[];
  legsPerSet: number;
  setsToWin: number;
  flags: string[];
}

// ============================================
// GAME MODES
// ============================================

export type GameMode = 301 | 501;

export interface GameConfig {
  gameMode: GameMode;
  legsPerSet: number;
  setsToWin: number;
  playerCount: number;
}

// ============================================
// DART & BOARD TYPES
// ============================================

export interface Position {
  x: number;
  y: number;
}

export interface DartPosition extends Position {
  id: string;
  score: number;
  multiplier: number;
  segment: string;
}

export interface ThrowResult {
  score: number;
  multiplier: number;
  segment: string;
  position: Position;
  isBust: boolean;
}

export interface ThrowHistoryEntry {
  playerId: string;
  playerName: string;
  throws: ThrowResult[];
  turnScore: number;
  remainingScore: number;
}

// ============================================
// SCORING
// ============================================

export interface GameStats {
  [playerId: string]: PlayerStats;
}

export interface PlayerStats {
  dartsThrown: number;
  totalScore: number;
  averagePerDart: number;
  averagePerTurn: number;
  highest3DartScore: number;
  checkoutPercentage: number;
  triples: number;
  doubles: number;
  bulls: number;
  one80s: number;
}

export interface PracticeStats {
  dartsThrown: number;
  t20: number;
  t19: number;
  t18: number;
  bulls: number;
  singleBull: number;
  triples: number;
  doubles: number;
  totalScore: number;
}

// ============================================
// MATCH SCORES
// ============================================

export interface MatchScores {
  legScores: number[];  // Legs won per player
  setScores: number[];  // Sets won per player
  legDartsThrown: number[];  // Darts thrown per player in current leg
}

// ============================================
// ONLINE MULTIPLAYER
// ============================================

export interface OnlineGameRoom {
  id: string;
  player1: OnlinePlayer;
  player2: OnlinePlayer | null;
  currentTurn: 'player1' | 'player2';
  gameState: GameState;
  gameConfig: GameConfig;
  createdAt: number;
  lastActivity: number;
}

export interface OnlinePlayer {
  id: string;
  name: string;
  flag: string;
  level: number;
  avatar?: string | null;
  connected: boolean;
  lastHeartbeat: number;
}

// ============================================
// ACHIEVEMENTS
// ============================================

export type AchievementCategory = 'offline' | 'online' | 'weekly' | 'daily';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  requirement: number;
  rewardCoins?: number;
}

export interface AchievementStats {
  totalGamesPlayed: number;
  totalGamesWon: number;
  total180s: number;
  totalNineDarters: number;
  totalOnlineGames: number;
  totalOnlineWins: number;
  totalBulls: number;
  totalTriples: number;
  highestCheckout: number;
}

// ============================================
// COIN SYSTEM & WAGERING
// ============================================

export type StakeLevel = 50 | 100 | 500 | 2500;

export interface Wallet {
  coins: number;
  lastDailyBonus?: number;
  lastAdReward?: number;
  adRewardsToday?: number;
}

export interface EscrowData {
  id: string;
  amount: number;
  player1Id: string;
  player2Id: string;
  status: 'pending' | 'locked' | 'settled' | 'refunded';
  createdAt: number;
}

// ============================================
// USER PROFILE
// ============================================

export interface UserProfile {
  displayName: string;
  flag: string;
  avatar?: string | null;
  createdAt: number;
  lastSeen: number;
}

export interface UserProgression {
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalXp: number;
}

export interface UserStreaks {
  currentWinStreak: number;
  bestWinStreak: number;
  lastGameWon: boolean;
}

// ============================================
// THEMES
// ============================================

export type ThemeId = 'classic' | 'pro_wire' | 'neon_glow' | 'gold_elite' | 'stealth';

export type NeonColor = 'cyan' | 'magenta' | 'green' | 'orange';

export interface DartboardTheme {
  id: ThemeId;
  name: string;
  description: string;
  colors: ThemeColors;
  wireStyle: WireStyle;
  premiumOnly?: boolean;
}

export interface ThemeColors {
  segment1: string;
  segment2: string;
  double: string;
  triple: string;
  bullOuter: string;
  bullInner: string;
  wire: string;
  numbers: string;
  background: string;
}

export interface WireStyle {
  width: number;
  glow?: boolean;
  glowColor?: string;
  glowIntensity?: number;
}

// ============================================
// CHALLENGES
// ============================================

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard';

export interface DailyChallenge {
  id: string;
  name: string;
  description: string;
  difficulty: ChallengeDifficulty;
  requirement: number;
  rewardCoins: number;
  progress: number;
  completed: boolean;
}

export interface WeeklyChallenge {
  weekNumber: number;
  challenge: Achievement;
  progress: number;
  completed: boolean;
  expiresAt: number;
}

// ============================================
// UI STATE
// ============================================

export interface ScorePopup {
  score: number;
  segment: string;
  position: Position;
  isBust: boolean;
  isCheckout: boolean;
}

export interface AchievementPopup {
  achievement: Achievement;
  timestamp: number;
}

// ============================================
// FIREBASE TYPES (for type safety)
// ============================================

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateEscrowResponse {
  escrowId: string;
  amount: number;
}

export interface SettleGameResponse {
  winnerId: string;
  payout: number;
  levelUp?: {
    newLevel: number;
    xpGained: number;
  };
}

// ============================================
// CONSTANTS (as readonly types)
// ============================================

export const DARTBOARD_SEGMENTS = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5
] as const;

export const STAKE_LEVELS: readonly StakeLevel[] = [50, 100, 500, 2500] as const;

export const SKILL_LEVELS = {
  BEGINNER: 40,
  INTERMEDIATE: 60,
  ADVANCED: 80,
  EXPERT: 95,
} as const;
