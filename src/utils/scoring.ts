/**
 * Scoring Utilities
 *
 * Core dart scoring logic - hit detection, score calculation,
 * and checkout route determination.
 */

import type { Position, ThrowResult } from '../types';
import {
  BOARD_SIZE,
  CENTER,
  SEGMENTS,
  INNER_BULL,
  OUTER_BULL,
  TRIPLE_INNER,
  TRIPLE_OUTER,
  DOUBLE_INNER,
  DOUBLE_OUTER,
  CHECKOUT_ROUTES,
} from '../constants';

/**
 * Calculate the score for a dart at position (x, y)
 * Returns score, label, and multiplier
 */
export function calculateScore(x: number, y: number): ThrowResult {
  const dx = x - CENTER;
  const dy = y - CENTER;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Miss - outside the board
  if (distance > DOUBLE_OUTER) {
    return {
      score: 0,
      multiplier: 0,
      segment: 'MISS',
      position: { x, y },
      isBust: false,
    };
  }

  // Inner bullseye (50 points)
  if (distance <= INNER_BULL) {
    return {
      score: 50,
      multiplier: 2, // Counts as double for checkout
      segment: 'BULL',
      position: { x, y },
      isBust: false,
    };
  }

  // Outer bull (25 points)
  if (distance <= OUTER_BULL) {
    return {
      score: 25,
      multiplier: 1,
      segment: '25',
      position: { x, y },
      isBust: false,
    };
  }

  // Calculate angle to determine segment
  let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;

  const segmentIndex = Math.floor((angle + 9) / 18) % 20;
  const baseScore = SEGMENTS[segmentIndex];

  // Double ring (outer edge)
  if (distance >= DOUBLE_INNER && distance <= DOUBLE_OUTER) {
    return {
      score: baseScore * 2,
      multiplier: 2,
      segment: `D${baseScore}`,
      position: { x, y },
      isBust: false,
    };
  }

  // Triple ring (inner thin ring)
  if (distance >= TRIPLE_INNER && distance <= TRIPLE_OUTER) {
    return {
      score: baseScore * 3,
      multiplier: 3,
      segment: `T${baseScore}`,
      position: { x, y },
      isBust: false,
    };
  }

  // Single segment
  return {
    score: baseScore,
    multiplier: 1,
    segment: `${baseScore}`,
    position: { x, y },
    isBust: false,
  };
}

/**
 * Get the position of a segment center for AI targeting
 */
export function getSegmentPosition(
  segmentValue: number,
  multiplier: 1 | 2 | 3 = 1
): Position {
  const segmentIndex = SEGMENTS.indexOf(segmentValue);
  if (segmentIndex === -1) {
    return { x: CENTER, y: CENTER };
  }

  const angle = ((segmentIndex * 18 - 90) * Math.PI) / 180;
  let distance: number;

  if (multiplier === 3) {
    distance = (TRIPLE_INNER + TRIPLE_OUTER) / 2;
  } else if (multiplier === 2) {
    distance = (DOUBLE_INNER + DOUBLE_OUTER) / 2;
  } else {
    distance = (TRIPLE_OUTER + DOUBLE_INNER) / 2;
  }

  return {
    x: CENTER + distance * Math.cos(angle),
    y: CENTER + distance * Math.sin(angle),
  };
}

/**
 * Parse dart notation (T20, D16, Bull, etc.) to board position
 */
export function parseDartNotation(notation: string): Position {
  if (notation === 'Bull') {
    return { x: CENTER, y: CENTER };
  }

  const prefix = notation[0];
  const segment = parseInt(notation.slice(1), 10);

  if (isNaN(segment)) {
    return { x: CENTER, y: CENTER };
  }

  let multiplier: 1 | 2 | 3 = 1;
  if (prefix === 'T') multiplier = 3;
  else if (prefix === 'D') multiplier = 2;

  return getSegmentPosition(segment, multiplier);
}

/**
 * Get checkout suggestion for a given score
 * SECURITY: Validates score range before lookup to prevent out-of-bounds access
 */
export function getCheckoutSuggestion(score: number): string | null {
  // Validate score is within checkout range
  if (!Number.isInteger(score) || score < 2 || score > 170) {
    return null;
  }
  return CHECKOUT_ROUTES[score] || null;
}

/**
 * Check if a score is checkable (can be finished with 3 darts ending on double)
 */
export function isCheckable(score: number): boolean {
  // Minimum checkout is 2 (D1)
  // Maximum checkout is 170 (T20 T20 Bull)
  // Score of 1 is impossible (can't finish on double)
  return score >= 2 && score <= 170 && score !== 1;
}

/**
 * Calculate if a throw would bust
 * Bust occurs when: score goes below 0, equals 1, or exceeds remaining
 * Also busts if reaching 0 without hitting a double
 */
export function wouldBust(
  currentScore: number,
  throwScore: number,
  multiplier: number
): boolean {
  const newScore = currentScore - throwScore;

  // Going negative
  if (newScore < 0) return true;

  // Score of 1 is impossible to checkout
  if (newScore === 1) return true;

  // Reaching 0 without a double (must finish on double)
  if (newScore === 0 && multiplier !== 2) return true;

  return false;
}

/**
 * Add randomness to a throw based on skill level and power
 */
export function addThrowRandomness(
  targetX: number,
  targetY: number,
  skillLevel: number,
  power: number,
  isInPerfectZone: boolean
): Position {
  // Perfect zone = no randomness
  if (isInPerfectZone) {
    return { x: targetX, y: targetY };
  }

  const skillFactor = (100 - skillLevel) / 100;
  const powerFactor = Math.abs(power - 50) / 50;

  const skillRandomness = skillFactor * 25;
  const powerRandomness = powerFactor * 20;

  // Penalty for being far from perfect power (50)
  const distanceFromPerfect = Math.abs(power - 50);
  const perfectZonePenalty = 80 + distanceFromPerfect * 1.2;

  const randomness = skillRandomness + powerRandomness + perfectZonePenalty;

  const angle = Math.random() * Math.PI * 2;
  const offset = Math.random() * randomness;

  return {
    x: targetX + Math.cos(angle) * offset,
    y: targetY + Math.sin(angle) * offset,
  };
}

/**
 * Calculate average per dart
 */
export function calculateAveragePerDart(
  totalScore: number,
  dartsThrown: number
): number {
  if (dartsThrown === 0) return 0;
  return Math.round((totalScore / dartsThrown) * 100) / 100;
}

/**
 * Calculate average per turn (3 darts)
 */
export function calculateAveragePerTurn(
  totalScore: number,
  dartsThrown: number
): number {
  if (dartsThrown === 0) return 0;
  return Math.round(((totalScore / dartsThrown) * 3) * 100) / 100;
}

/**
 * Calculate checkout percentage
 */
export function calculateCheckoutPercentage(
  checkoutsHit: number,
  checkoutAttempts: number
): number {
  if (checkoutAttempts === 0) return 0;
  return Math.round((checkoutsHit / checkoutAttempts) * 100);
}
