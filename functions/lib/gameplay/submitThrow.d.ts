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
 */
import * as functions from 'firebase-functions';
export declare const submitThrow: functions.HttpsFunction & functions.Runnable<any>;
