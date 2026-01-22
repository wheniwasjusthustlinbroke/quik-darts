/**
 * AI Utilities
 *
 * AI player logic for different difficulty levels.
 */

import type { Position, AIDifficulty } from '../types';
import { CHECKOUT_ROUTES } from '../constants';
import { getSegmentPosition, parseDartNotation } from './scoring';

/**
 * AI difficulty configurations
 */
export interface AIDifficultyConfig {
  key: AIDifficulty;
  accuracy: number;
  label: string;
}

export const AI_DIFFICULTIES: Record<string, AIDifficultyConfig> = {
  BEGINNER: {
    key: 'easy',
    accuracy: 35,
    label: 'Beginner',
  },
  INTERMEDIATE: {
    key: 'medium',
    accuracy: 60,
    label: 'Intermediate',
  },
  EXPERT: {
    key: 'hard',
    accuracy: 80,
    label: 'Expert',
  },
  IMPOSSIBLE: {
    key: 'expert',
    accuracy: 95,
    label: 'Impossible',
  },
};

/**
 * Get AI difficulty config by key
 */
export function getAIDifficultyConfig(
  difficulty: AIDifficulty
): AIDifficultyConfig | undefined {
  return Object.values(AI_DIFFICULTIES).find((d) => d.key === difficulty);
}

/**
 * Get AI target position based on difficulty and current score
 */
export function getAITarget(
  difficulty: AIDifficulty,
  currentScore: number
): Position {
  // Expert and Impossible AI use checkout routes when available
  if (
    CHECKOUT_ROUTES[currentScore] &&
    (difficulty === 'hard' || difficulty === 'expert')
  ) {
    const suggestion = CHECKOUT_ROUTES[currentScore];
    const firstTarget = suggestion.split(' ')[0];
    return parseDartNotation(firstTarget);
  }

  // Target selection based on difficulty
  switch (difficulty) {
    case 'easy':
      // Beginner aims for big single numbers
      return getSegmentPosition(19, 1);

    case 'medium':
      // Intermediate aims for T19 (safer than T20)
      return getSegmentPosition(19, 3);

    case 'hard':
    case 'expert':
      // Expert aims for T20 (maximum scoring)
      return getSegmentPosition(20, 3);

    default:
      return getSegmentPosition(20, 1);
  }
}

/**
 * Calculate AI throw with accuracy-based randomness
 */
export function calculateAIThrow(
  target: Position,
  difficulty: AIDifficulty
): Position {
  const config = getAIDifficultyConfig(difficulty);
  const accuracy = config?.accuracy ?? 50;

  // Higher accuracy = less randomness
  const maxDeviation = ((100 - accuracy) / 100) * 80;

  // Random angle and distance from target
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * maxDeviation;

  return {
    x: target.x + Math.cos(angle) * distance,
    y: target.y + Math.sin(angle) * distance,
  };
}

/**
 * AI decision for checkout strategy
 * Returns the optimal first dart target for a checkout
 */
export function getAICheckoutTarget(currentScore: number): Position | null {
  const route = CHECKOUT_ROUTES[currentScore];
  if (!route) return null;

  const firstTarget = route.split(' ')[0];
  return parseDartNotation(firstTarget);
}

/**
 * Determine if AI should go for checkout
 * AI attempts checkout when score is 170 or below
 */
export function shouldAttemptCheckout(score: number): boolean {
  return score >= 2 && score <= 170 && score !== 1;
}

/**
 * Get AI thinking delay based on difficulty
 * More skilled AI "thinks" faster
 */
export function getAIThinkingDelay(difficulty: AIDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return 1500 + Math.random() * 1000; // 1.5-2.5s
    case 'medium':
      return 1000 + Math.random() * 800; // 1-1.8s
    case 'hard':
      return 600 + Math.random() * 600; // 0.6-1.2s
    case 'expert':
      return 400 + Math.random() * 400; // 0.4-0.8s
    default:
      return 1000;
  }
}

/**
 * AI celebration/reaction messages
 */
export const AI_REACTIONS = {
  hit180: ['Maximum!', 'Perfect!', '180!'],
  hitTriple: ['Nice!', 'Triple!', 'Great shot!'],
  hitDouble: ['Double!', 'Got it!', 'On target!'],
  hitBull: ['Bulls eye!', 'Center!', 'Nice!'],
  miss: ['Oh no!', 'Missed!', 'Next time!'],
  bust: ['Bust!', 'Too much!', 'Unlucky!'],
  checkout: ['Game shot!', 'Winner!', 'Checkout!'],
};

/**
 * Get random AI reaction for an event
 */
export function getAIReaction(
  event: keyof typeof AI_REACTIONS
): string {
  const reactions = AI_REACTIONS[event];
  return reactions[Math.floor(Math.random() * reactions.length)];
}
