/**
 * Legacy Meter - Oscillating Power System
 *
 * Matches the original quikdarts.com gameplay:
 * - Oscillating power bar (0→100→0→100...)
 * - Perfect zone centered at 50%
 * - Zone shrinking on perfect hits
 * - Binary accuracy (perfect = 100%, else massive scatter)
 */

// === OSCILLATION CONSTANTS (from legacy index.html lines 4020-4029) ===
export const OSCILLATION_INTERVAL_MS = 20; // 20ms per step
export const OSCILLATION_STEP = 2; // ±2% per step

// === PERFECT ZONE CONSTANTS ===
export const PERFECT_ZONE_CENTER = 50; // Centered at 50%
export const PERFECT_ZONE_BASE_WIDTH = 10; // 10% base width
export const PERFECT_ZONE_MIN_WIDTH = 4; // Minimum after shrinking
export const PERFECT_ZONE_WINNING_DOUBLE = 2; // Ultra-small for checkout

// === SHRINK RATES (from legacy index.html lines 3730-3746) ===
export const SHRINK_RATE_ONLINE = 3;
export const SHRINK_RATE_EXPERT = 3;
export const SHRINK_RATE_INTERMEDIATE = 2.5;

/**
 * Calculate perfect zone width based on game state.
 *
 * Legacy behavior (index.html lines 3730-3746):
 * - Beginner (skill <= 40): constant 10%
 * - Intermediate (41-80): shrinks by 2.5% per perfect hit
 * - Expert/Online (81+ or online): shrinks by 3% per perfect hit
 * - Checkout: ultra-small 2% zone
 *
 * KNOWN PARITY GAP: isAimingAtWinningDouble uses isCheckoutPosition proxy
 * (score 2-170) rather than parsing checkout route target segment.
 */
export function calculatePerfectZoneWidth(
  skillLevel: number,
  perfectHits: number,
  isOnline: boolean,
  isAimingAtWinningDouble: boolean
): number {
  // Checkout: ultra-small zone
  if (isAimingAtWinningDouble) {
    return PERFECT_ZONE_WINNING_DOUBLE;
  }

  // Beginner: constant width, no shrinking
  if (skillLevel <= 40) {
    return PERFECT_ZONE_BASE_WIDTH;
  }

  // Expert/Online or Intermediate: shrink based on perfect hits
  const shrinkRate =
    isOnline || skillLevel >= 81
      ? SHRINK_RATE_EXPERT
      : SHRINK_RATE_INTERMEDIATE;

  return Math.max(
    PERFECT_ZONE_BASE_WIDTH - perfectHits * shrinkRate,
    PERFECT_ZONE_MIN_WIDTH
  );
}

/**
 * Check if power is in perfect zone (dynamic width, centered at 50).
 */
export function isInPerfectZone(power: number, zoneWidth: number): boolean {
  const left = PERFECT_ZONE_CENTER - zoneWidth / 2;
  const right = PERFECT_ZONE_CENTER + zoneWidth / 2;
  return power > left && power < right;
}

/**
 * Get zone boundaries for UI rendering.
 */
export function getPerfectZoneBounds(zoneWidth: number): {
  left: number;
  right: number;
} {
  return {
    left: PERFECT_ZONE_CENTER - zoneWidth / 2,
    right: PERFECT_ZONE_CENTER + zoneWidth / 2,
  };
}
