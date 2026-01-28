/**
 * Aim Wobble Utility
 *
 * Calculates wobble conditions and offsets for pressure situations:
 * 1. Expert 180 attempt: Two T20s hit, going for third
 * 2. Checkout double: Aiming at winning double
 */

import type { ThrowResult, Position } from '../types';
import { SEGMENTS, CENTER, DOUBLE_INNER, DOUBLE_OUTER } from '../constants';

/** Wobble configuration */
export interface WobbleConfig {
  /** Skill threshold for 180 wobble (0-100). Higher skill = more wobble pressure */
  skill180Threshold: number;
  /** Skill threshold for checkout wobble (0-100) */
  skillCheckoutThreshold: number;
  /** Maximum wobble amount in pixels */
  wobbleAmount: number;
  /** Wobble update interval in ms */
  wobbleInterval: number;
  /** Distance tolerance for detecting aim at checkout double (pixels) */
  aimTolerancePx: number;
}

export const DEFAULT_WOBBLE_CONFIG: WobbleConfig = {
  skill180Threshold: 81,
  skillCheckoutThreshold: 41,
  wobbleAmount: 8,
  wobbleInterval: 50,
  aimTolerancePx: 30,
};

/**
 * Check if player has hit two T20s this turn (120 points from triple 20s)
 * ThrowResult.segment is a string (e.g., '20', 'BULL')
 */
function hasTwoTriple20s(currentTurnThrows: ThrowResult[]): boolean {
  if (currentTurnThrows.length !== 2) return false;

  return currentTurnThrows.every(
    (t) => t.segment === '20' && t.multiplier === 3
  );
}

/**
 * Check if score is a valid double checkout (2-40 even, or 50 for bull)
 */
function isDoubleCheckout(score: number): boolean {
  // Bullseye checkout
  if (score === 50) return true;

  // Double checkout: must be even number between 2 and 40
  return score >= 2 && score <= 40 && score % 2 === 0;
}

/**
 * Get the target position for a double segment.
 *
 * SEGMENTS order: [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
 * - Clockwise starting from 20 at top (12 o'clock)
 * - Each segment spans 18 degrees (360/20)
 * - Angle formula matches Dartboard.tsx: ((index * 18 - 90) * PI / 180)
 *   The -90 rotates so index 0 (segment 20) is at top
 */
export function getDoubleTargetPosition(score: number): Position | null {
  if (score === 50) {
    // Bull
    return { x: CENTER, y: CENTER };
  }

  // Find segment index for this double value
  const doubleValue = score / 2;
  const segmentIndex = SEGMENTS.indexOf(doubleValue as typeof SEGMENTS[number]);

  if (segmentIndex === -1) return null;

  // Calculate angle for segment center (matches Dartboard.tsx line 207)
  const segmentAngle = ((segmentIndex * 18 - 90) * Math.PI) / 180;

  // Target the middle of the double ring
  const doubleRadius = (DOUBLE_INNER + DOUBLE_OUTER) / 2;

  return {
    x: CENTER + doubleRadius * Math.cos(segmentAngle),
    y: CENTER + doubleRadius * Math.sin(segmentAngle),
  };
}

/**
 * Check if aim position is targeting the checkout double
 */
function isAimingAtCheckoutDouble(
  aimPosition: Position,
  playerScore: number,
  tolerancePx: number
): boolean {
  if (!isDoubleCheckout(playerScore)) return false;

  const targetPos = getDoubleTargetPosition(playerScore);
  if (!targetPos) return false;

  // Check if aim is within tolerance of target
  const dx = aimPosition.x - targetPos.x;
  const dy = aimPosition.y - targetPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance < tolerancePx;
}

export interface WobbleConditionResult {
  shouldWobble: boolean;
  reason: 'none' | '180_attempt' | 'checkout_double';
}

/**
 * Check if wobble should be active based on game conditions
 */
export function checkWobbleConditions(
  skillLevel: number,
  currentTurnThrows: ThrowResult[],
  dartsThrown: number,
  playerScore: number | undefined,
  aimPosition: Position,
  config: WobbleConfig = DEFAULT_WOBBLE_CONFIG
): WobbleConditionResult {
  // No wobble if player score unknown
  if (playerScore === undefined) {
    return { shouldWobble: false, reason: 'none' };
  }

  // Check for 180 attempt (3rd dart after two T20s)
  if (
    skillLevel >= config.skill180Threshold &&
    dartsThrown === 2 &&
    hasTwoTriple20s(currentTurnThrows)
  ) {
    return { shouldWobble: true, reason: '180_attempt' };
  }

  // Check for checkout double
  if (
    skillLevel >= config.skillCheckoutThreshold &&
    isDoubleCheckout(playerScore) &&
    isAimingAtCheckoutDouble(aimPosition, playerScore, config.aimTolerancePx)
  ) {
    return { shouldWobble: true, reason: 'checkout_double' };
  }

  return { shouldWobble: false, reason: 'none' };
}

/**
 * Generate a random wobble offset
 * @param amount - Maximum wobble in pixels
 * @param rng - Random number generator (0-1), injectable for determinism/replays
 */
export function generateWobbleOffset(
  amount: number,
  rng: () => number = Math.random
): Position {
  return {
    x: (rng() - 0.5) * amount,
    y: (rng() - 0.5) * amount,
  };
}
