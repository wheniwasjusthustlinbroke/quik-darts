/**
 * Game Difficulty Utility
 *
 * Maps difficulty settings to skill levels.
 * Decoupled from AI so Expert Mode can apply to any game type.
 */

/**
 * Game difficulty levels.
 * Applies to overall game challenge, not just AI opponent.
 */
export type GameDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * Display configuration for each difficulty level.
 */
export interface DifficultyConfig {
  key: GameDifficulty;
  label: string;
  description: string;
  skillLevel: number;
}

/**
 * Difficulty configurations with skill levels.
 * Higher skill = more pressure situations may trigger.
 *
 * - Easy: Defaults below most wobble thresholds
 * - Medium: May trigger checkout pressure
 * - Hard: May trigger checkout pressure
 * - Expert: May trigger both 180 and checkout pressure
 */
export const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
  {
    key: 'easy',
    label: 'Easy',
    description: 'Relaxed gameplay',
    skillLevel: 35,
  },
  {
    key: 'medium',
    label: 'Medium',
    description: 'Balanced challenge',
    skillLevel: 55,
  },
  {
    key: 'hard',
    label: 'Hard',
    description: 'Increased pressure',
    skillLevel: 75,
  },
  {
    key: 'expert',
    label: 'Expert',
    description: 'Maximum pressure',
    skillLevel: 90,
  },
];

/** Default skill level when no difficulty specified */
export const DEFAULT_SKILL_LEVEL = 50;

/**
 * Get skill level for a given difficulty.
 */
export function getSkillLevelForDifficulty(difficulty?: GameDifficulty): number {
  if (!difficulty) return DEFAULT_SKILL_LEVEL;
  const config = DIFFICULTY_CONFIGS.find((c) => c.key === difficulty);
  return config?.skillLevel ?? DEFAULT_SKILL_LEVEL;
}

/**
 * Get difficulty config by key.
 */
export function getDifficultyConfig(difficulty: GameDifficulty): DifficultyConfig | undefined {
  return DIFFICULTY_CONFIGS.find((c) => c.key === difficulty);
}
