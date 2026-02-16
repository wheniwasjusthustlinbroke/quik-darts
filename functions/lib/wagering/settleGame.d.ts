/**
 * Settle Game
 *
 * Settles a wagered game by releasing escrow to the winner.
 * Called automatically when a game ends or on forfeit.
 *
 * Security:
 * - Only callable by players in the game
 * - Verifies game is finished
 * - Prevents double settlement with requestId-based settlement lock
 * - Uses atomic transaction for coin transfer
 * - Recoverable: if wallet update fails, settlement lock is released for retry
 * - Winner ID derived from server-authoritative game state, not user input
 */
import * as functions from 'firebase-functions';
export declare const SETTLEMENT_LOCK_TIMEOUT_MS = 120000;
export declare const settleGame: functions.HttpsFunction & functions.Runnable<any>;
