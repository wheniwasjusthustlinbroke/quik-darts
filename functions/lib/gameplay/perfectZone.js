"use strict";
/**
 * Perfect Zone Helpers
 *
 * Pure functions for dynamic perfect zone calculation.
 * Used by submitThrow.ts for server-authoritative scatter.
 *
 * NOTE: This file must stay in sync with client logic (if applicable).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHRINK_DOUBLE_SINGLE = exports.SHRINK_TREBLE = exports.PERFECT_ZONE_CHECKOUT = exports.PERFECT_ZONE_MIN_WIDTH = exports.PERFECT_ZONE_BASE_WIDTH = exports.PERFECT_ZONE_CENTER = void 0;
exports.normalizeLabel = normalizeLabel;
exports.getWinningSegment = getWinningSegment;
exports.calculatePerfectZoneBounds = calculatePerfectZoneBounds;
exports.calculateShrinkToAdd = calculateShrinkToAdd;
// Zone configuration constants
exports.PERFECT_ZONE_CENTER = 50;
exports.PERFECT_ZONE_BASE_WIDTH = 10; // 10% base width
exports.PERFECT_ZONE_MIN_WIDTH = 4; // Minimum after shrinking
exports.PERFECT_ZONE_CHECKOUT = 2; // Ultra-narrow for checkout
// Shrink rates based on what was hit (matches client logic)
exports.SHRINK_TREBLE = 3;
exports.SHRINK_DOUBLE_SINGLE = 1.5;
/**
 * Normalize segment label for consistent comparison.
 * Handles potential variations in bull/double naming.
 */
function normalizeLabel(label) {
    const upper = label.toUpperCase().trim();
    if (upper === 'DBULL' || upper === 'D25' || upper === 'BULLSEYE')
        return 'BULL';
    return upper;
}
/**
 * Get the winning segment for a score (exact double/bull to finish).
 * Returns normalized segment label: D20, BULL, etc. or null if can't finish.
 */
function getWinningSegment(remainingScore) {
    if (remainingScore === 50)
        return 'BULL';
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
function calculatePerfectZoneBounds(shrinkAmount, isCheckout) {
    const width = isCheckout
        ? exports.PERFECT_ZONE_CHECKOUT
        : Math.max(exports.PERFECT_ZONE_BASE_WIDTH - shrinkAmount, exports.PERFECT_ZONE_MIN_WIDTH);
    return {
        min: exports.PERFECT_ZONE_CENTER - width / 2,
        max: exports.PERFECT_ZONE_CENTER + width / 2,
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
function calculateShrinkToAdd(multiplier, score, label, winningSegment) {
    // Miss → no shrink
    if (score === 0)
        return 0;
    const normalizedLabel = normalizeLabel(label);
    // Treble → 3%
    if (multiplier === 3)
        return exports.SHRINK_TREBLE;
    // Double or Bull
    if (multiplier === 2 || normalizedLabel === 'BULL') {
        // Winning segment → no shrink
        if (winningSegment && normalizedLabel === winningSegment)
            return 0;
        // Non-winning double/bull → 1.5%
        return exports.SHRINK_DOUBLE_SINGLE;
    }
    // Single (score > 0) → 1.5%
    return exports.SHRINK_DOUBLE_SINGLE;
}
//# sourceMappingURL=perfectZone.js.map