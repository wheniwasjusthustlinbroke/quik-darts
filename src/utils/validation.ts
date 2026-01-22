/**
 * Validation Utilities
 *
 * All input validation functions for game state integrity.
 * These prevent cheating and ensure data consistency.
 */

import type { GameMode, ThrowResult, DartPosition } from '../types';

/**
 * Validate a player's score against game rules
 * Score cannot be negative, above starting score, or equal to 1 (impossible checkout)
 */
export function validateScore(score: unknown, gameMode: GameMode): number {
  if (typeof score !== 'number' || !Number.isInteger(score)) {
    return gameMode;
  }
  if (score < 0 || score > gameMode || score === 1) {
    return gameMode;
  }
  return score;
}

/**
 * Validate player index (0 or 1 for two-player games)
 */
export function validatePlayerIndex(index: unknown): 0 | 1 {
  if (typeof index !== 'number' || !Number.isInteger(index)) {
    return 0;
  }
  return index === 0 || index === 1 ? (index as 0 | 1) : 0;
}

/**
 * Validate darts thrown in a turn (0-3)
 */
export function validateDartsThrown(darts: unknown): number {
  if (typeof darts !== 'number' || !Number.isInteger(darts)) {
    return 0;
  }
  return darts >= 0 && darts <= 3 ? darts : 0;
}

/**
 * Validate turn score (0-180, maximum possible in one turn)
 */
export function validateTurnScore(score: unknown): number {
  if (typeof score !== 'number' || !Number.isInteger(score)) {
    return 0;
  }
  return score >= 0 && score <= 180 ? score : 0;
}

/**
 * Validate an array of two scores (leg scores, set scores)
 */
export function validateScoreArray(arr: unknown, defaultValue = 0): [number, number] {
  if (!Array.isArray(arr) || arr.length !== 2) {
    return [defaultValue, defaultValue];
  }
  return arr.map((val) => {
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
      return defaultValue;
    }
    return val;
  }) as [number, number];
}

/**
 * Validate a single throw item from game history
 */
export interface ValidatedThrowItem {
  score: number;
  label: string;
  player: 0 | 1;
  multiplier: number;
}

export function validateThrowItem(item: unknown): ValidatedThrowItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const obj = item as Record<string, unknown>;

  const score =
    typeof obj.score === 'number' && obj.score >= 0 && obj.score <= 180
      ? obj.score
      : 0;

  // Sanitize label to prevent XSS - only allow alphanumeric and !
  const rawLabel = typeof obj.label === 'string' ? obj.label : '';
  const label = rawLabel.replace(/[^A-Z0-9!]/gi, '').slice(0, 10) || 'MISS';

  const player: 0 | 1 = obj.player === 0 || obj.player === 1 ? obj.player : 0;

  const multiplier =
    typeof obj.multiplier === 'number' &&
    obj.multiplier >= 0 &&
    obj.multiplier <= 3
      ? obj.multiplier
      : 1;

  return { score, label, player, multiplier };
}

/**
 * Validate dart position on the board (0-500 range)
 */
export function validateDartPosition(pos: unknown): DartPosition | null {
  if (!pos || typeof pos !== 'object') {
    return null;
  }

  const obj = pos as Record<string, unknown>;

  const x =
    typeof obj.x === 'number' && obj.x >= 0 && obj.x <= 500 ? obj.x : 250;
  const y =
    typeof obj.y === 'number' && obj.y >= 0 && obj.y <= 500 ? obj.y : 250;

  return {
    id: typeof obj.id === 'string' ? obj.id : crypto.randomUUID(),
    x,
    y,
    score: typeof obj.score === 'number' ? obj.score : 0,
    multiplier: typeof obj.multiplier === 'number' ? obj.multiplier : 1,
    segment: typeof obj.segment === 'string' ? obj.segment : 'MISS',
  };
}

/**
 * Validate game mode (301 or 501)
 */
export function validateGameMode(mode: unknown): GameMode {
  if (mode === 301 || mode === 501) {
    return mode;
  }
  return 501;
}

/**
 * Validate stake level for wagered matches
 * SECURITY: Strict integer check prevents type coercion attacks
 */
export function validateStakeLevel(
  stake: unknown
): 50 | 100 | 500 | 2500 | null {
  // Strict type check - must be integer, not float or NaN
  if (typeof stake !== 'number' || !Number.isInteger(stake)) {
    return null;
  }
  const validStakes = [50, 100, 500, 2500];
  if (validStakes.includes(stake)) {
    return stake as 50 | 100 | 500 | 2500;
  }
  return null;
}

/**
 * Sanitize user display name to prevent XSS
 * SECURITY: Normalizes Unicode first to prevent bypass attacks,
 * then whitelists only printable ASCII characters
 */
export function sanitizeDisplayName(name: unknown): string {
  if (typeof name !== 'string') {
    return 'Player';
  }

  // Normalize Unicode to prevent lookalike character attacks
  // NFKC normalization converts special Unicode characters to ASCII equivalents
  const normalized = name.normalize('NFKC');

  // Whitelist only printable ASCII characters (32-126)
  // This is safer than blacklisting HTML tags
  const sanitized = normalized
    .replace(/[^\x20-\x7E]/g, '') // Only ASCII 32-126
    .trim()
    .slice(0, 20); // Max 20 characters

  return sanitized || 'Player';
}

/**
 * Validate and sanitize a user ID
 * Firebase UIDs are alphanumeric
 */
export function validateUserId(uid: unknown): string | null {
  if (typeof uid !== 'string') {
    return null;
  }
  // Firebase UIDs are typically 28 alphanumeric characters
  if (!/^[a-zA-Z0-9]{20,128}$/.test(uid)) {
    return null;
  }
  return uid;
}
