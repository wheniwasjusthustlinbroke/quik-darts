/**
 * Perfect Zone Helpers
 *
 * Pure functions for dynamic perfect zone calculation.
 * Used by submitThrow.ts for server-authoritative scatter.
 *
 * NOTE: This file must stay in sync with client logic (if applicable).
 */
export declare const PERFECT_ZONE_CENTER = 50;
export declare const PERFECT_ZONE_BASE_WIDTH = 10;
export declare const PERFECT_ZONE_MIN_WIDTH = 4;
export declare const PERFECT_ZONE_CHECKOUT = 2;
export declare const SHRINK_TREBLE = 3;
export declare const SHRINK_DOUBLE_SINGLE = 1.5;
/**
 * Normalize segment label for consistent comparison.
 * Handles potential variations in bull/double naming.
 */
export declare function normalizeLabel(label: string): string;
/**
 * Get the winning segment for a score (exact double/bull to finish).
 * Returns normalized segment label: D20, BULL, etc. or null if can't finish.
 */
export declare function getWinningSegment(remainingScore: number): string | null;
/**
 * Calculate perfect zone bounds based on current shrink amount.
 * @param shrinkAmount - Accumulated shrink this turn (0 for first throw)
 * @param isCheckout - True if aiming at winning double/bull
 * @returns { min, max } zone bounds (strict: power must be > min and < max)
 */
export declare function calculatePerfectZoneBounds(shrinkAmount: number, isCheckout: boolean): {
    min: number;
    max: number;
};
/**
 * Calculate shrink amount to add based on score result.
 * Only call this when wasPerfectHit is true.
 * @param multiplier - Score multiplier (1=single, 2=double, 3=treble)
 * @param score - Points scored
 * @param label - Segment label (will be normalized)
 * @param winningSegment - The winning segment for pre-throw score (or null)
 * @returns Shrink amount to add (0, 1.5, or 3)
 */
export declare function calculateShrinkToAdd(multiplier: number, score: number, label: string, winningSegment: string | null): number;
