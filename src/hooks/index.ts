/**
 * Hooks - Export all custom hooks
 */

export { useAuth } from './useAuth';
export type { AuthState, UseAuthReturn } from './useAuth';

export { useProfile, getXPForLevel, getRankTitle } from './useProfile';
export type { UserProfile, UserProgression, UserStreaks, ProfileState } from './useProfile';

export { useGameState } from './useGameState';
export type { GameConfig, PlayerSetupData, UseGameStateReturn } from './useGameState';

export { useSound } from './useSound';
export type { SoundType, UseSoundReturn } from './useSound';

export {
  useLocalStorage,
  useAchievements,
  useAchievementStats,
  useThemeSettings,
} from './useLocalStorage';
export type {
  UseLocalStorageOptions,
  AchievementStatsData,
  ThemeSettings,
} from './useLocalStorage';
