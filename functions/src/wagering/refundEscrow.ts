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
import * as admin from 'firebase-admin';

const db = admin.database();

interface RefundEscrowRequest {
  escrowId: string;
  reason?: 'cancelled' | 'expired' | 'error';
}

interface RefundEscrowResult {
  success: boolean;
  refundedPlayers?: string[];
  refundedAmounts?: number[];
  error?: string;
}

export const refundEscrow = functions
  .region('europe-west1')
  .https.onCall(async (data: RefundEscrowRequest, context): Promise<RefundEscrowResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in'
      );
    }

    const userId = context.auth.uid;
    const { escrowId, reason = 'cancelled' } = data;

    // 2. Validate request
    if (!escrowId || typeof escrowId !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid escrow ID'
      );
    }

    // 3. Fetch escrow
    const escrowRef = db.ref(`escrow/${escrowId}`);
    const escrowSnap = await escrowRef.once('value');
    const escrow = escrowSnap.val();

    if (!escrow) {
      throw new functions.https.HttpsError(
        'not-found',
        'Escrow not found'
      );
    }

    // 4. Verify caller is in the escrow
    const isPlayer1 = escrow.player1?.userId === userId;
    const isPlayer2 = escrow.player2?.userId === userId;
    if (!isPlayer1 && !isPlayer2) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a participant in this escrow'
      );
    }

    // 5. Check escrow status
    const now = Date.now();
    const isExpired = escrow.expiresAt && escrow.expiresAt < now;

    // Can only refund if:
    // - Status is 'pending' (opponent never joined), OR
    // - Escrow is expired
    if (escrow.status === 'locked' && !isExpired) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot refund a locked escrow. The game must be completed or forfeited.'
      );
    }

    if (escrow.status === 'released' || escrow.status === 'refunded') {
      return {
        success: true,
        error: `Escrow already ${escrow.status}`,
      };
    }

    // 6. Refund all players
    const refundedPlayers: string[] = [];
    const refundedAmounts: number[] = [];

    // Refund player 1
    if (escrow.player1) {
      await refundPlayer(
        escrow.player1.userId,
        escrow.player1.amount,
        escrowId,
        reason,
        now
      );
      refundedPlayers.push(escrow.player1.userId);
      refundedAmounts.push(escrow.player1.amount);
    }

    // Refund player 2
    if (escrow.player2) {
      await refundPlayer(
        escrow.player2.userId,
        escrow.player2.amount,
        escrowId,
        reason,
        now
      );
      refundedPlayers.push(escrow.player2.userId);
      refundedAmounts.push(escrow.player2.amount);
    }

    // 7. Update escrow status
    await escrowRef.update({
      status: 'refunded',
      refundedAt: now,
      refundReason: reason,
    });

    console.log(`[refundEscrow] Escrow ${escrowId} refunded. Players: ${refundedPlayers.join(', ')}`);

    return {
      success: true,
      refundedPlayers,
      refundedAmounts,
    };
  });

/**
 * Refund coins to a single player
 */
async function refundPlayer(
  playerId: string,
  amount: number,
  escrowId: string,
  reason: string,
  timestamp: number
): Promise<void> {
  const walletRef = db.ref(`users/${playerId}/wallet`);

  // Atomic transaction to return coins
  await walletRef.transaction((wallet) => {
    if (!wallet) return wallet;

    return {
      ...wallet,
      coins: (wallet.coins || 0) + amount,
      // Don't add to lifetimeEarnings - this is a refund, not earnings
      lifetimeSpent: Math.max(0, (wallet.lifetimeSpent || 0) - amount),
      version: (wallet.version || 0) + 1,
    };
  });

  // Log transaction
  await db.ref(`users/${playerId}/transactions`).push({
    type: 'refund',
    amount: amount,
    escrowId,
    description: `Escrow refund (${reason})`,
    timestamp,
  });

  console.log(`[refundPlayer] Refunded ${amount} coins to ${playerId}`);
}

/**
 * Scheduled function to clean up expired escrows
 * Run every 5 minutes
 */
export const cleanupExpiredEscrows = functions
  .region('europe-west1')
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const now = Date.now();

    // Find expired escrows that are still pending or locked
    const escrowsSnap = await db.ref('escrow')
      .orderByChild('expiresAt')
      .endAt(now)
      .once('value');

    const escrows = escrowsSnap.val();
    if (!escrows) {
      console.log('[cleanupExpiredEscrows] No expired escrows found');
      return;
    }

    let refundedCount = 0;

    for (const [escrowId, escrow] of Object.entries(escrows as Record<string, any>)) {
      if (escrow.status === 'pending' || escrow.status === 'locked') {
        console.log(`[cleanupExpiredEscrows] Refunding expired escrow ${escrowId}`);

        // Refund player 1
        if (escrow.player1) {
          await refundPlayer(
            escrow.player1.userId,
            escrow.player1.amount,
            escrowId,
            'expired',
            now
          );
        }

        // Refund player 2
        if (escrow.player2) {
          await refundPlayer(
            escrow.player2.userId,
            escrow.player2.amount,
            escrowId,
            'expired',
            now
          );
        }

        // Update escrow status
        await db.ref(`escrow/${escrowId}`).update({
          status: 'refunded',
          refundedAt: now,
          refundReason: 'expired',
        });

        refundedCount++;
      }
    }

    console.log(`[cleanupExpiredEscrows] Refunded ${refundedCount} expired escrows`);
  });
