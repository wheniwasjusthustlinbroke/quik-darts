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
/**
 * Result type for refundSingleEscrow - forces callers to check success
 */
export type RefundSingleEscrowResult = {
    success: boolean;
    refundedPlayers: string[];
    refundedAmounts: number[];
    error?: 'not_found' | 'not_eligible' | 'in_progress' | 'partial_failure';
};
/**
 * Shared helper: fully refund a single escrow (status change + wallet credits).
 * Uses two-phase refunding → refunded state machine for safety.
 * Idempotent — safe to call multiple times for the same escrow.
 */
export declare function refundSingleEscrow(escrowId: string, reason: string, options?: {
    forceLocked?: boolean;
}): Promise<RefundSingleEscrowResult>;
export declare const refundEscrow: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Scheduled function to clean up expired escrows
 * Run every 5 minutes
 */
export declare const cleanupExpiredEscrows: functions.CloudFunction<unknown>;
