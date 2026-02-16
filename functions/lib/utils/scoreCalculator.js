"use strict";
/**
 * Score Calculator - Server-side dart position to score calculation
 *
 * This mirrors the client-side calculation exactly to ensure
 * server-validated scores match what the client displays.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEGMENTS = exports.DOUBLE_OUTER = exports.DOUBLE_INNER = exports.TRIPLE_OUTER = exports.TRIPLE_INNER = exports.OUTER_BULL = exports.INNER_BULL = exports.CENTER = exports.BOARD_SIZE = void 0;
exports.calculateScoreFromPosition = calculateScoreFromPosition;
exports.isValidDartPosition = isValidDartPosition;
exports.isBust = isBust;
exports.isCheckout = isCheckout;
// Dartboard geometry constants (matches client)
exports.BOARD_SIZE = 530;
exports.CENTER = exports.BOARD_SIZE / 2; // 250
// Ring distances from center
exports.INNER_BULL = 10;
exports.OUTER_BULL = 20;
exports.TRIPLE_INNER = 119;
exports.TRIPLE_OUTER = 134;
exports.DOUBLE_INNER = 200;
exports.DOUBLE_OUTER = 215;
// Segment values in clockwise order starting from top (20)
exports.SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
/**
 * Calculate the score from a dart position on the board.
 *
 * @param x - X coordinate (0-500)
 * @param y - Y coordinate (0-500)
 * @returns ScoreResult with score, label, and multiplier
 */
function calculateScoreFromPosition(x, y) {
    const dx = x - exports.CENTER;
    const dy = y - exports.CENTER;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // Miss - outside the board
    if (distance > exports.DOUBLE_OUTER) {
        return { score: 0, label: 'MISS', multiplier: 0 };
    }
    // Inner bullseye (50 points)
    if (distance <= exports.INNER_BULL) {
        return { score: 50, label: 'BULL', multiplier: 2 }; // Bull is a double for checkout
    }
    // Outer bullseye (25 points)
    if (distance <= exports.OUTER_BULL) {
        return { score: 25, label: '25', multiplier: 1 };
    }
    // Calculate segment based on angle
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0)
        angle += 360;
    const segmentIndex = Math.floor((angle + 9) / 18) % 20;
    const baseScore = exports.SEGMENTS[segmentIndex];
    // Double ring (outer edge)
    if (distance >= exports.DOUBLE_INNER && distance <= exports.DOUBLE_OUTER) {
        return {
            score: baseScore * 2,
            label: `D${baseScore}`,
            multiplier: 2,
            base: baseScore,
        };
    }
    // Triple ring
    if (distance >= exports.TRIPLE_INNER && distance <= exports.TRIPLE_OUTER) {
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
function isValidDartPosition(position) {
    if (!position || typeof position !== 'object')
        return false;
    if (typeof position.x !== 'number' || typeof position.y !== 'number')
        return false;
    if (position.x < 0 || position.x > exports.BOARD_SIZE)
        return false;
    if (position.y < 0 || position.y > exports.BOARD_SIZE)
        return false;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
        return false;
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
function isBust(currentScore, throwScore, multiplier) {
    const newScore = currentScore - throwScore;
    // Negative score = bust
    if (newScore < 0)
        return true;
    // Score of 1 = bust (can't checkout)
    if (newScore === 1)
        return true;
    // Score of 0 but not with a double = bust
    if (newScore === 0 && multiplier !== 2)
        return true;
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
function isCheckout(currentScore, throwScore, multiplier) {
    return currentScore === throwScore && multiplier === 2;
}
//# sourceMappingURL=scoreCalculator.js.map