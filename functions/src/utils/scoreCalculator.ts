/**
 * Score Calculator - Server-side dart position to score calculation
 *
 * This mirrors the client-side calculation exactly to ensure
 * server-validated scores match what the client displays.
 */

// Dartboard geometry constants (matches client)
export const BOARD_SIZE = 500;
export const CENTER = BOARD_SIZE / 2; // 250

// Ring distances from center
export const INNER_BULL = 10;
export const OUTER_BULL = 20;
export const TRIPLE_INNER = 119;
export const TRIPLE_OUTER = 134;
export const DOUBLE_INNER = 200;
export const DOUBLE_OUTER = 215;

// Segment values in clockwise order starting from top (20)
export const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export interface ScoreResult {
  score: number;
  label: string;
  multiplier: number;
  base?: number;
}

export interface DartPosition {
  x: number;
  y: number;
}

/**
 * Calculate the score from a dart position on the board.
 *
 * @param x - X coordinate (0-500)
 * @param y - Y coordinate (0-500)
 * @returns ScoreResult with score, label, and multiplier
 */
export function calculateScoreFromPosition(x: number, y: number): ScoreResult {
  const dx = x - CENTER;
  const dy = y - CENTER;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Miss - outside the board
  if (distance > DOUBLE_OUTER) {
    return { score: 0, label: 'MISS', multiplier: 0 };
  }

  // Inner bullseye (50 points)
  if (distance <= INNER_BULL) {
    return { score: 50, label: 'BULL', multiplier: 1 };
  }

  // Outer bullseye (25 points)
  if (distance <= OUTER_BULL) {
    return { score: 25, label: '25', multiplier: 1 };
  }

  // Calculate segment based on angle
  let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  const segmentIndex = Math.floor((angle + 9) / 18) % 20;
  const baseScore = SEGMENTS[segmentIndex];

  // Double ring (outer edge)
  if (distance >= DOUBLE_INNER && distance <= DOUBLE_OUTER) {
    return {
      score: baseScore * 2,
      label: `D${baseScore}`,
      multiplier: 2,
      base: baseScore,
    };
  }

  // Triple ring
  if (distance >= TRIPLE_INNER && distance <= TRIPLE_OUTER) {
    return {
      score: baseScore * 3,
      label: `T${baseScore}`,
      multiplier: 3,
      base: baseScore,
    };
  }

  // Single (regular segment)
  return {
    score: baseScore,
    label: `${baseScore}`,
    multiplier: 1,
    base: baseScore,
  };
}

/**
 * Validate that a dart position is within valid bounds.
 *
 * @param position - The dart position to validate
 * @returns true if valid, false otherwise
 */
export function isValidDartPosition(position: DartPosition): boolean {
  if (!position || typeof position !== 'object') return false;
  if (typeof position.x !== 'number' || typeof position.y !== 'number') return false;
  if (position.x < 0 || position.x > BOARD_SIZE) return false;
  if (position.y < 0 || position.y > BOARD_SIZE) return false;
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  return true;
}

/**
 * Check if a score would result in a bust.
 *
 * Bust conditions:
 * - New score would be negative
 * - New score would be 1 (can't checkout with 1)
 * - New score would be 0 but not with a double
 *
 * @param currentScore - Player's current score
 * @param throwScore - Score from the throw
 * @param multiplier - Throw multiplier (2 for double)
 * @returns true if the throw results in a bust
 */
export function isBust(
  currentScore: number,
  throwScore: number,
  multiplier: number
): boolean {
  const newScore = currentScore - throwScore;

  // Negative score = bust
  if (newScore < 0) return true;

  // Score of 1 = bust (can't checkout)
  if (newScore === 1) return true;

  // Score of 0 but not with a double = bust
  if (newScore === 0 && multiplier !== 2) return true;

  return false;
}

/**
 * Check if a throw wins the game (valid checkout).
 *
 * @param currentScore - Player's current score
 * @param throwScore - Score from the throw
 * @param multiplier - Throw multiplier (must be 2 for double)
 * @returns true if this is a valid checkout
 */
export function isCheckout(
  currentScore: number,
  throwScore: number,
  multiplier: number
): boolean {
  return currentScore === throwScore && multiplier === 2;
}
