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

    // SPECIAL CASE: cleanup_pending - find and refund any pending escrows for this user
    if (escrowId === 'cleanup_pending') {
      console.log(`[refundEscrow] Cleanup pending escrows for user ${userId}`);
      const now = Date.now();

      // Find all pending escrows where user is player1 or player2
      const escrowsSnap = await db.ref('escrow')
        .orderByChild('status')
        .equalTo('pending')
        .once('value');

      const escrows = escrowsSnap.val();
      if (!escrows) {
        return { success: true, refundedPlayers: [], refundedAmounts: [] };
      }

      const refundedPlayers: string[] = [];
      const refundedAmounts: number[] = [];

      for (const [eid, escrow] of Object.entries(escrows as Record<string, any>)) {
        const isPlayer1 = escrow.player1?.userId === userId;
        const isPlayer2 = escrow.player2?.userId === userId;

        if (!isPlayer1 && !isPlayer2) continue;

        // Skip if not expired and locked
        const isExpired = escrow.expiresAt && escrow.expiresAt < now;
        if (escrow.status === 'locked' && !isExpired) continue;

        // Refund this escrow
        const escrowRef = db.ref(`escrow/${eid}`);
        const refundResult = await escrowRef.transaction((currentEscrow) => {
          if (!currentEscrow) return currentEscrow;
          if (currentEscrow.status === 'released' || currentEscrow.status === 'refunded') {
            return; // Already processed
          }
          return {
            ...currentEscrow,
            status: 'refunded',
            refundedAt: now,
            refundReason: 'cleanup_before_new_match',
          };
        });

        if (refundResult.committed && refundResult.snapshot.val()?.status === 'refunded') {
          const refundedEscrow = refundResult.snapshot.val();

          // Refund player1
          if (refundedEscrow.player1) {
            const p1Amount = refundedEscrow.player1.amount;
            await db.ref(`users/${refundedEscrow.player1.userId}/wallet`).transaction((wallet) => {
              if (!wallet) return wallet;
              return {
                ...wallet,
                coins: (wallet.coins || 0) + p1Amount,
                lifetimeSpent: Math.max(0, (wallet.lifetimeSpent || 0) - p1Amount),
                version: (wallet.version || 0) + 1,
              };
            });
            refundedPlayers.push(refundedEscrow.player1.userId);
            refundedAmounts.push(p1Amount);
          }

          // Refund player2 if exists
          if (refundedEscrow.player2) {
            const p2Amount = refundedEscrow.player2.amount;
            await db.ref(`users/${refundedEscrow.player2.userId}/wallet`).transaction((wallet) => {
              if (!wallet) return wallet;
              return {
                ...wallet,
                coins: (wallet.coins || 0) + p2Amount,
                lifetimeSpent: Math.max(0, (wallet.lifetimeSpent || 0) - p2Amount),
                version: (wallet.version || 0) + 1,
              };
            });
            refundedPlayers.push(refundedEscrow.player2.userId);
            refundedAmounts.push(p2Amount);
          }

          // Also remove from queue if still there
          const queueStake = refundedEscrow.stakeLevel;
          if (queueStake) {
            await db.ref(`matchmaking_queue/wagered/${queueStake}/${userId}`).remove();
          }

          console.log(`[refundEscrow] Cleaned up stale escrow ${eid} for user ${userId}`);
        }
      }

      return { success: true, refundedPlayers, refundedAmounts };
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

    // 6. CRITICAL: Use atomic transaction to prevent double-refund race condition
    // This atomically transitions escrow from pending/locked to refunded
    const refundResult = await escrowRef.transaction((currentEscrow) => {
      if (!currentEscrow) return currentEscrow;

      // Already refunded or released by another concurrent call - abort
      if (currentEscrow.status === 'released' || currentEscrow.status === 'refunded') {
        console.log(`[refundEscrow] Escrow ${escrowId} already ${currentEscrow.status}, aborting`);
        return; // Abort transaction
      }

      // Can only refund if pending OR (locked AND expired)
      const isLockedAndExpired = currentEscrow.status === 'locked' && currentEscrow.expiresAt && currentEscrow.expiresAt < now;
      if (currentEscrow.status !== 'pending' && !isLockedAndExpired) {
        console.log(`[refundEscrow] Escrow ${escrowId} in status ${currentEscrow.status}, cannot refund`);
        return; // Abort transaction
      }

      // Atomically mark as refunded
      return {
        ...currentEscrow,
        status: 'refunded',
        refundedAt: now,
        refundReason: reason,
      };
    });

    // Check if transaction was committed
    if (!refundResult.committed || refundResult.snapshot.val()?.status !== 'refunded') {
      // Another concurrent call already processed this escrow
      console.log(`[refundEscrow] Escrow ${escrowId} already processed by another call`);
      return {
        success: true,
        error: 'Escrow already processed',
      };
    }

    // 7. Now refund players (safe - escrow is atomically marked as refunded)
    const refundedEscrow = refundResult.snapshot.val();
    const refundedPlayers: string[] = [];
    const refundedAmounts: number[] = [];

    // Refund player 1
    if (refundedEscrow.player1) {
      await refundPlayer(
        refundedEscrow.player1.userId,
        refundedEscrow.player1.amount,
        escrowId,
        reason,
        now
      );
      refundedPlayers.push(refundedEscrow.player1.userId);
      refundedAmounts.push(refundedEscrow.player1.amount);
    }

    // Refund player 2
    if (refundedEscrow.player2) {
      await refundPlayer(
        refundedEscrow.player2.userId,
        refundedEscrow.player2.amount,
        escrowId,
        reason,
        now
      );
      refundedPlayers.push(refundedEscrow.player2.userId);
      refundedAmounts.push(refundedEscrow.player2.amount);
    }

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
        console.log(`[cleanupExpiredEscrows] Processing expired escrow ${escrowId}`);

        const escrowRef = db.ref(`escrow/${escrowId}`);

        // CRITICAL: Use atomic transaction to prevent double-refund race condition
        const refundResult = await escrowRef.transaction((currentEscrow) => {
          if (!currentEscrow) return currentEscrow;

          // Already processed - abort
          if (currentEscrow.status === 'released' || currentEscrow.status === 'refunded') {
            return; // Abort transaction
          }

          // Not expired anymore (edge case with clock skew)
          if (currentEscrow.expiresAt && currentEscrow.expiresAt > now) {
            return; // Abort transaction
          }

          // Atomically mark as refunded
          return {
            ...currentEscrow,
            status: 'refunded',
            refundedAt: now,
            refundReason: 'expired',
          };
        });

        // Only process refunds if we successfully marked escrow as refunded
        if (refundResult.committed && refundResult.snapshot.val()?.status === 'refunded') {
          const refundedEscrow = refundResult.snapshot.val();

          // Refund player 1
          if (refundedEscrow.player1) {
            await refundPlayer(
              refundedEscrow.player1.userId,
              refundedEscrow.player1.amount,
              escrowId,
              'expired',
              now
            );
          }

          // Refund player 2
          if (refundedEscrow.player2) {
            await refundPlayer(
              refundedEscrow.player2.userId,
              refundedEscrow.player2.amount,
              escrowId,
              'expired',
              now
            );
          }

          refundedCount++;
          console.log(`[cleanupExpiredEscrows] Refunded expired escrow ${escrowId}`);
        } else {
          console.log(`[cleanupExpiredEscrows] Escrow ${escrowId} already processed, skipping`);
        }
      }
    }

    console.log(`[cleanupExpiredEscrows] Refunded ${refundedCount} expired escrows`);
  });
