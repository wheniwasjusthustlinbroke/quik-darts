/**
 * Create Escrow
 *
 * Locks coins from a player's wallet into escrow for a wagered match.
 * Both players must call this before the game starts.
 *
 * Security:
 * - Rejects anonymous users
 * - Verifies sufficient balance
 * - Uses atomic transaction to prevent race conditions
 * - Prevents joining multiple games simultaneously
 * - 30-minute expiration for abandoned escrows
 * - Rate limited: max 5 escrows per user per hour (prevents lockup attacks)
 */
import * as functions from 'firebase-functions';
export declare const createEscrow: functions.HttpsFunction & functions.Runnable<any>;
