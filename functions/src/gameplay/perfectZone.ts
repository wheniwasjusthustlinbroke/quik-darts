/**
 * Perfect Zone Helpers
 *
 * Pure functions for dynamic perfect zone calculation.
 * Used by submitThrow.ts for server-authoritative scatter.
 *
 * NOTE: This file must stay in sync with client logic (if applicable).
 */

// Zone configuration constants
export const PERFECT_ZONE_CENTER = 50;
export const PERFECT_ZONE_BASE_WIDTH = 10;  // 10% base width
export const PERFECT_ZONE_MIN_WIDTH = 4;    // Minimum after shrinking
export const PERFECT_ZONE_CHECKOUT = 2;     // Ultra-narrow for checkout

// Shrink rates based on what was hit (matches client logic)
export const SHRINK_TREBLE = 3;
export const SHRINK_DOUBLE_SINGLE = 1.5;

/**
 * Normalize segment label for consistent comparison.
 * Handles potential variations in bull/double naming.
 */
export function normalizeLabel(label: string): string {
  const upper = label.toUpperCase().trim();
  if (upper === 'DBULL' || upper === 'D25' || upper === 'BULLSEYE') return 'BULL';
  return upper;
}

/**
 * Get the winning segment for a score (exact double/bull to finish).
 * Returns normalized segment label: D20, BULL, etc. or null if can't finish.
 */
export function getWinningSegment(remainingScore: number): string | null {
  if (remainingScore === 50) return 'BULL';
  if (remainingScore % 2 === 0 && remainingScore >= 2 && remainingScore <= 40) {
    return `D${remainingScore / 2}`;
  }
  return null;
}

/**
 * Calculate perfect zone bounds based on current shrink amount.
 * @param shrinkAmount - Accumulated shrink this turn (0 for first throw)
 * @param isCheckout - True if aiming at winning double/bull
 * @returns { min, max } zone bounds (strict: power must be > min and < max)
 */
export function calculatePerfectZoneBounds(
  shrinkAmount: number,
  isCheckout: boolean
): { min: number; max: number } {
  const width = isCheckout
    ? PERFECT_ZONE_CHECKOUT
    : Math.max(PERFECT_ZONE_BASE_WIDTH - shrinkAmount, PERFECT_ZONE_MIN_WIDTH);

  return {
    min: PERFECT_ZONE_CENTER - width / 2,
    max: PERFECT_ZONE_CENTER + width / 2,
  };
}

/**
 * Calculate shrink amount to add based on score result.
 * Only call this when wasPerfectHit is true.
 * @param multiplier - Score multiplier (1=single, 2=double, 3=treble)
 * @param score - Points scored
 * @param label - Segment label (will be normalized)
 * @param winningSegment - The winning segment for pre-throw score (or null)
 * @returns Shrink amount to add (0, 1.5, or 3)
 */
export function calculateShrinkToAdd(
  multiplier: number,
  score: number,
  label: string,
  winningSegment: string | null
): number {
  // Miss → no shrink
  if (score === 0) return 0;

  const normalizedLabel = normalizeLabel(label);

  // Treble → 3%
  if (multiplier === 3) return SHRINK_TREBLE;

  // Double or Bull
  if (multiplier === 2 || normalizedLabel === 'BULL') {
    // Winning segment → no shrink
    if (winningSegment && normalizedLabel === winningSegment) return 0;
    // Non-winning double/bull → 1.5%
    return SHRINK_DOUBLE_SINGLE;
  }

  // Single (score > 0) → 1.5%
  return SHRINK_DOUBLE_SINGLE;
}
