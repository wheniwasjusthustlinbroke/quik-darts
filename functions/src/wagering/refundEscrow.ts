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

/**
 * Shared helper: fully refund a single escrow (status change + wallet credits).
 * Idempotent — safe to call multiple times for the same escrow.
 * Preserves same eligibility checks as refundEscrow Cloud Function.
 */
export async function refundSingleEscrow(
  escrowId: string,
  reason: string,
  options?: { forceLocked?: boolean }
): Promise<{ refundedPlayers: string[]; refundedAmounts: number[] } | null> {
  const now = Date.now();
  const escrowRef = db.ref(`escrow/${escrowId}`);
  const forceLocked = options?.forceLocked ?? false;

  // Pre-read to get escrow data (also populates cache)
  const preSnap = await escrowRef.once('value');
  const preEscrow = preSnap.val();

  if (!preEscrow) {
    return null; // Escrow doesn't exist
  }

  const refundResult = await escrowRef.transaction((currentEscrow) => {
    // CRITICAL FIX: Use pre-read escrow if callback receives null (Admin SDK cold start)
    const esc = currentEscrow ?? preEscrow;

    if (!esc) return;  // Should never happen since we pre-checked

    if (esc.status === 'released' || esc.status === 'refunded') {
      return; // terminal → abort
    }

    const isLockedAndExpired = esc.status === 'locked' && esc.expiresAt && esc.expiresAt < now;
    if (esc.status !== 'pending' && !isLockedAndExpired && !(forceLocked && esc.status === 'locked')) {
      return; // active match → abort (unless forceLocked for server-side recovery)
    }

    return {
      ...esc,
      status: 'refunded',
      refundedAt: now,
      refundReason: reason,
    };
  });

  if (!refundResult.committed || refundResult.snapshot.val()?.status !== 'refunded') {
    return null;
  }

  const refunded = refundResult.snapshot.val();
  const refundedPlayers: string[] = [];
  const refundedAmounts: number[] = [];

  if (refunded.player1) {
    await refundPlayer(refunded.player1.userId, refunded.player1.amount, escrowId, reason, now);
    refundedPlayers.push(refunded.player1.userId);
    refundedAmounts.push(refunded.player1.amount);
  }
  if (refunded.player2) {
    await refundPlayer(refunded.player2.userId, refunded.player2.amount, escrowId, reason, now);
    refundedPlayers.push(refunded.player2.userId);
    refundedAmounts.push(refunded.player2.amount);
  }

  console.log(`[refundSingleEscrow] Refunded escrow ${escrowId} (${reason})`);
  return { refundedPlayers, refundedAmounts };
}

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

    // SPECIAL CASE: cleanup_pending - find and refund pending OR expired locked escrows
    if (escrowId === 'cleanup_pending') {
      console.log(`[refundEscrow] Cleaning up pending/expired-locked escrows for user ${userId}`);
      const now = Date.now();

      // Query 1: Find all pending escrows
      const pendingSnap = await db.ref('escrow')
        .orderByChild('status')
        .equalTo('pending')
        .once('value');

      // Query 2: Find expired escrows (any status) by expiresAt
      const expiredSnap = await db.ref('escrow')
        .orderByChild('expiresAt')
        .endAt(now)
        .once('value');

      // Merge and dedupe (expired query may include already-refunded escrows)
      const pendingEscrows = pendingSnap.val() || {};
      const expiredEscrows = expiredSnap.val() || {};
      const escrows = { ...pendingEscrows, ...expiredEscrows };

      if (!Object.keys(escrows).length) {
        return { success: true, refundedPlayers: [], refundedAmounts: [] };
      }

      const refundedPlayers: string[] = [];
      const refundedAmounts: number[] = [];

      for (const [eid, escrow] of Object.entries(escrows as Record<string, any>)) {
        const isPlayer1 = escrow.player1?.userId === userId;
        const isPlayer2 = escrow.player2?.userId === userId;

        // Skip if not this user's escrow
        if (!isPlayer1 && !isPlayer2) continue;

        // Skip if already processed
        if (escrow.status === 'released' || escrow.status === 'refunded') continue;

        // Safety predicate for locked escrows:
        // Only refund if expired AND no active game
        if (escrow.status === 'locked') {
          const isExpired = escrow.expiresAt && escrow.expiresAt < now;
          const hasNoGame = !escrow.gameId && !escrow.matchedGameId;
          if (!isExpired || !hasNoGame) continue;  // Skip active games
        }

        // Refund this escrow
        const escrowRef = db.ref(`escrow/${eid}`);
        // Use escrow from query as fallback (Admin SDK cold start fix)
        const refundResult = await escrowRef.transaction((currentEscrow) => {
          // CRITICAL FIX: Use query escrow if callback receives null
          const esc = currentEscrow ?? escrow;
          if (!esc) return;
          if (esc.status === 'released' || esc.status === 'refunded') {
            return; // Already processed
          }
          return {
            ...esc,
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

          console.log(`[refundEscrow] Cleaned up stale escrow`);
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
    // NOTE: We already have `escrow` from line 231. If transaction callback gets null
    // (Admin SDK cold start quirk), we use the pre-read value to force a proper transaction.
    // This triggers conflict detection if the server value changed.

    // This atomically transitions escrow from pending/locked to refunded
    const refundResult = await escrowRef.transaction((currentEscrow) => {
      // CRITICAL FIX: Use pre-read escrow if callback receives null (Admin SDK cold start)
      const esc = currentEscrow ?? escrow;

      if (!esc) {
        console.log(`[refundEscrow] No escrow data available, aborting`);
        return; // Abort - should never happen since we pre-checked
      }

      // Already refunded or released by another concurrent call - abort
      if (esc.status === 'released' || esc.status === 'refunded') {
        console.log(`[refundEscrow] Escrow already processed (${esc.status}), aborting`);
        return; // Abort transaction
      }

      // Can only refund if pending OR (locked AND expired)
      const isLockedAndExpired = esc.status === 'locked' && esc.expiresAt && esc.expiresAt < now;
      if (esc.status !== 'pending' && !isLockedAndExpired) {
        console.log(`[refundEscrow] Cannot refund - escrow in invalid state: ${esc.status}`);
        return; // Abort transaction
      }

      // Atomically mark as refunded
      console.log(`[refundEscrow] Marking escrow as refunded (was: ${esc.status})`);
      return {
        ...esc,
        status: 'refunded',
        refundedAt: now,
        refundReason: reason,
      };
    });

    // Check if transaction was committed
    if (!refundResult.committed || refundResult.snapshot.val()?.status !== 'refunded') {
      // Transaction aborted - re-read to check actual status
      const latestSnap = await escrowRef.once('value');
      const latestEscrow = latestSnap.val();

      if (latestEscrow?.status === 'refunded' || latestEscrow?.status === 'released') {
        // Actually was already processed by another call
        console.log(`[refundEscrow] Escrow confirmed already processed: ${latestEscrow.status}`);
        return {
          success: true,
          error: `Escrow already ${latestEscrow.status}`,
        };
      }

      // Transaction failed for other reason (no cache, race condition, etc.)
      console.error(`[refundEscrow] Transaction failed, escrow status: ${latestEscrow?.status ?? 'null'}`);
      return {
        success: false,
        error: 'Refund transaction failed - please retry',
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

    console.log(`[refundEscrow] Escrow refunded successfully`);

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

  console.log(`[refundPlayer] Refund processed successfully`);
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

        // Pre-read to verify escrow exists and get data for fallback
        const preSnap = await escrowRef.once('value');
        if (!preSnap.exists()) {
          console.log(`[cleanupExpiredEscrows] Escrow ${escrowId} no longer exists, skipping`);
          continue;
        }
        const preEscrow = preSnap.val();

        // Use atomic transaction to prevent double-refund race condition
        const refundResult = await escrowRef.transaction((currentEscrow) => {
          // CRITICAL FIX: Use pre-read escrow if callback receives null (Admin SDK cold start)
          const esc = currentEscrow ?? preEscrow;
          if (!esc) return;

          // Already processed - abort
          if (esc.status === 'released' || esc.status === 'refunded') {
            return; // Abort transaction
          }

          // Not expired anymore (edge case with clock skew)
          if (esc.expiresAt && esc.expiresAt > now) {
            return; // Abort transaction
          }

          // Atomically mark as refunded
          return {
            ...esc,
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
