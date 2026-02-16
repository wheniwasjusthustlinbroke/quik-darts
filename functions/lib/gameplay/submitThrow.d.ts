/**
 * Submit Throw
 *
 * Server-authoritative dart throw validation.
 * Every dart throw must go through this function.
 *
 * Security:
 * - Verifies it's the caller's turn
 * - Validates dart position bounds
 * - Server calculates score from position (no client trust)
 * - Server controls all game state updates
 * - Server validates throw plausibility (anti-cheat)
 * - Server calculates rhythm bonus from timestamps
 * - Rate limiting to prevent throw spam
 * - Wagered matches: escrow existence and lock status verified (not just game state)
 */
import * as functions from 'firebase-functions';
export declare const RHYTHM_CONFIG: {
    rushThreshold: number;
    idealMin: number;
    idealMax: number;
    hesitateThreshold: number;
    rushPenalty: number;
    hesitatePenalty: number;
    perfectBonus: number;
    consistencyBonus: number;
};
export declare const MIN_THROW_INTERVAL = 500;
export declare const PERFECT_ZONE: {
    min: number;
    max: number;
};
export declare const submitThrow: functions.HttpsFunction & functions.Runnable<any>;
