/**
 * Refund Escrow
 *
 * Refunds coins from escrow back to players.
 * Used for:
 * - Expired escrows (opponent never joined)
 * - Cancelled matches
 * - Technical issues
 *
 * Security:
 * - Only players in the escrow can request refund
 * - Escrow must be in 'pending' status (not yet locked)
 * - OR escrow must be expired
 * - Uses atomic transaction for coin return
 */
import * as functions from 'firebase-functions';
export declare const refundEscrow: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Scheduled function to clean up expired escrows
 * Run every 5 minutes
 */
export declare const cleanupExpiredEscrows: functions.CloudFunction<unknown>;
