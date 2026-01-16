/**
 * Score Calculator - Server-side dart position to score calculation
 *
 * This mirrors the client-side calculation exactly to ensure
 * server-validated scores match what the client displays.
 */
export declare const BOARD_SIZE = 500;
export declare const CENTER: number;
export declare const INNER_BULL = 10;
export declare const OUTER_BULL = 20;
export declare const TRIPLE_INNER = 119;
export declare const TRIPLE_OUTER = 134;
export declare const DOUBLE_INNER = 200;
export declare const DOUBLE_OUTER = 215;
export declare const SEGMENTS: number[];
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
export declare function calculateScoreFromPosition(x: number, y: number): ScoreResult;
/**
 * Validate that a dart position is within valid bounds.
 *
 * @param position - The dart position to validate
 * @returns true if valid, false otherwise
 */
export declare function isValidDartPosition(position: DartPosition): boolean;
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
export declare function isBust(currentScore: number, throwScore: number, multiplier: number): boolean;
/**
 * Check if a throw wins the game (valid checkout).
 *
 * @param currentScore - Player's current score
 * @param throwScore - Score from the throw
 * @param multiplier - Throw multiplier (must be 2 for double)
 * @returns true if this is a valid checkout
 */
export declare function isCheckout(currentScore: number, throwScore: number, multiplier: number): boolean;
