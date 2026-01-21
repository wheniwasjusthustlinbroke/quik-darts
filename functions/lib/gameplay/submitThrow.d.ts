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
export declare const submitThrow: functions.HttpsFunction & functions.Runnable<any>;
