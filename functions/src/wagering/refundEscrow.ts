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
import { checkRateLimit, RATE_LIMITS } from '../utils/rateLimit';

const db = admin.database();

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
export async function refundSingleEscrow(
  escrowId: string,
  reason: string,
  options?: { forceLocked?: boolean }
): Promise<RefundSingleEscrowResult> {
  const now = Date.now();
  const escrowRef = db.ref(`escrow/${escrowId}`);
  const forceLocked = options?.forceLocked ?? false;
  const refundRequestId = `helper_${now}_${Math.random().toString(36).substring(2, 8)}`;

  const preSnap = await escrowRef.once('value');
  const preEscrow = preSnap.val();

  if (!preEscrow) {
    return { success: false, refundedPlayers: [], refundedAmounts: [], error: 'not_found' };
  }

  // Phase 1: Transition to 'refunding' (intermediate state)
  const refundResult = await escrowRef.transaction((currentEscrow) => {
    const esc = currentEscrow ?? preEscrow;
    if (!esc) return;

    if (esc.status === 'refunded') return;
    if (esc.status === 'released') return;
    if (esc.gameId || esc.matchedGameId) return;

    if (esc.status === 'refunding') {
      const REFUND_STALE_MS = 60_000;
      const refundAge = now - (esc.refundStartedAt || 0);
      if (refundAge < REFUND_STALE_MS && esc.refundRequestId) return;
    } else {
      const isLockedAndExpired = esc.status === 'locked' && esc.expiresAt && esc.expiresAt < now;
      if (esc.status !== 'pending' && !isLockedAndExpired && !(forceLocked && esc.status === 'locked')) return;
    }

    return {
      ...esc,
      status: 'refunding',
      refundRequestId,
      refundStartedAt: now,
      refundReason: reason,
      refundApplied: esc.refundApplied || { player1: false, player2: false },
    };
  });

  const escrowAfterPhase1 = refundResult.snapshot.val();

  if (!refundResult.committed || !escrowAfterPhase1) {
    const latest = (await escrowRef.once('value')).val();
    if (latest?.status === 'refunded') {
      return { success: true, refundedPlayers: [], refundedAmounts: [] };
    }
    if (latest?.status === 'refunding') {
      console.log(`[refundSingleEscrow] Escrow ${escrowId} refund in progress by another request`);
      return { success: false, refundedPlayers: [], refundedAmounts: [], error: 'in_progress' };
    }
    return { success: false, refundedPlayers: [], refundedAmounts: [], error: 'not_eligible' };
  }

  if (escrowAfterPhase1.status === 'refunded') {
    return { success: true, refundedPlayers: [], refundedAmounts: [] };
  }

  if (escrowAfterPhase1.refundRequestId !== refundRequestId) {
    console.log(`[refundSingleEscrow] Escrow ${escrowId} owned by another request`);
    return { success: false, refundedPlayers: [], refundedAmounts: [], error: 'in_progress' };
  }

  // Phase 2: Credit wallets (idempotent via wallet markers)
  const refundedPlayers: string[] = [];
  const refundedAmounts: number[] = [];
  let allSucceeded = true;

  if (escrowAfterPhase1.player1 && !escrowAfterPhase1.refundApplied?.player1) {
    const success = await refundPlayer(escrowAfterPhase1.player1.userId, escrowAfterPhase1.player1.amount, escrowId, reason, now, refundRequestId);
    if (success) {
      await escrowRef.child('refundApplied/player1').set(true);
      refundedPlayers.push(escrowAfterPhase1.player1.userId);
      refundedAmounts.push(escrowAfterPhase1.player1.amount);
    } else {
      allSucceeded = false;
    }
  } else if (escrowAfterPhase1.player1) {
    refundedPlayers.push(escrowAfterPhase1.player1.userId);
    refundedAmounts.push(escrowAfterPhase1.player1.amount);
  }

  if (escrowAfterPhase1.player2 && !escrowAfterPhase1.refundApplied?.player2) {
    const success = await refundPlayer(escrowAfterPhase1.player2.userId, escrowAfterPhase1.player2.amount, escrowId, reason, now, refundRequestId);
    if (success) {
      await escrowRef.child('refundApplied/player2').set(true);
      refundedPlayers.push(escrowAfterPhase1.player2.userId);
      refundedAmounts.push(escrowAfterPhase1.player2.amount);
    } else {
      allSucceeded = false;
    }
  } else if (escrowAfterPhase1.player2) {
    refundedPlayers.push(escrowAfterPhase1.player2.userId);
    refundedAmounts.push(escrowAfterPhase1.player2.amount);
  }

  // Phase 3: Finalize ONLY if all credits succeeded
  if (allSucceeded) {
    await escrowRef.update({
      status: 'refunded',
      refundedAt: now,
      refundError: null,
      refundRequestId: null,
      refundStartedAt: null,
    });
    console.log(`[refundSingleEscrow] Refunded escrow ${escrowId} (${reason})`);
    return { success: true, refundedPlayers, refundedAmounts };
  } else {
    await escrowRef.update({
      refundError: `wallet_credit_failed_${now}`,
      lastRefundAttemptAt: now,
      refundRequestId: null,
      refundStartedAt: null,
    });
    console.error(`[refundSingleEscrow] Partial failure for escrow ${escrowId}`);
    return { success: false, refundedPlayers, refundedAmounts, error: 'partial_failure' };
  }
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

    // 1.5. Rate limiting
    await checkRateLimit(userId, 'refundEscrow', RATE_LIMITS.refundEscrow.limit, RATE_LIMITS.refundEscrow.windowMs);

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

        // Use shared helper for two-phase refund
        const result = await refundSingleEscrow(eid, 'cleanup_before_new_match');

        if (result.success) {
          refundedPlayers.push(...result.refundedPlayers);
          refundedAmounts.push(...result.refundedAmounts);

          // Also remove from queue if still there
          const queueStake = escrow.stakeLevel;
          if (queueStake) {
            await db.ref(`matchmaking_queue/wagered/${queueStake}/${userId}`).remove();
          }
          console.log(`[refundEscrow] Cleaned up stale escrow ${eid}`);
        } else if (result.error === 'in_progress') {
          console.log(`[refundEscrow] Escrow ${eid} refund in progress, skipping`);
        } else if (result.error === 'partial_failure') {
          console.error(`[refundEscrow] Partial failure cleaning escrow ${eid}`);
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
      // Idempotent success - already processed, nothing to do
      return {
        success: true,
        refundedPlayers: [],
        refundedAmounts: [],
      };
    }

    // 6. Use shared helper for two-phase refund
    const result = await refundSingleEscrow(escrowId, reason);

    if (!result.success) {
      if (result.error === 'not_found') {
        throw new functions.https.HttpsError('not-found', 'Escrow not found');
      }
      if (result.error === 'in_progress') {
        console.log(`[refundEscrow] Escrow ${escrowId} refund in progress by another request`);
        return { success: false, error: 'Refund in progress by another request. Please retry.' };
      }
      if (result.error === 'partial_failure') {
        console.error(`[refundEscrow] Partial failure for escrow ${escrowId}`);
        return {
          success: false,
          refundedPlayers: result.refundedPlayers,
          refundedAmounts: result.refundedAmounts,
          error: 'Partial failure - some credits failed. Please retry.',
        };
      }
      return { success: false, error: 'Refund failed - please retry' };
    }

    console.log(`[refundEscrow] Escrow refunded successfully`);
    return {
      success: true,
      refundedPlayers: result.refundedPlayers,
      refundedAmounts: result.refundedAmounts,
    };
  });

/**
 * Refund coins to a single player
 * Uses idempotency marker (refundRequestId) to prevent double-credit
 */
async function refundPlayer(
  playerId: string,
  amount: number,
  escrowId: string,
  reason: string,
  timestamp: number,
  refundRequestId: string
): Promise<boolean> {
  const walletRef = db.ref(`users/${playerId}/wallet`);

  let walletResult;
  try {
    walletResult = await walletRef.transaction((wallet) => {
      // Abort if wallet doesn't exist
      if (!wallet) return;

      // Abort if marker exists (already refunded by someone)
      if (wallet.refundMarkers?.[escrowId]) return;

      // Apply credit + set marker atomically
      return {
        ...wallet,
        coins: (wallet.coins || 0) + amount,
        // Don't add to lifetimeEarnings - this is a refund, not earnings
        lifetimeSpent: Math.max(0, (wallet.lifetimeSpent || 0) - amount),
        version: (wallet.version || 0) + 1,
        refundMarkers: {
          ...(wallet.refundMarkers || {}),
          [escrowId]: refundRequestId,
        },
      };
    });
  } catch (e) {
    console.error(`[refundPlayer] EXCEPTION for player ${playerId}, escrowId: ${escrowId}:`, e);
    return false;
  }

  // Handle abort cases
  if (!walletResult.committed) {
    // Follow-up read to distinguish "already refunded" from "wallet missing"
    let checkSnap;
    try {
      checkSnap = await walletRef.child(`refundMarkers/${escrowId}`).once('value');
    } catch (e) {
      console.error(`[refundPlayer] FAILED - marker read failed for player ${playerId}, escrowId: ${escrowId}:`, e);
      return false;
    }
    if (checkSnap.exists()) {
      // Marker exists - idempotent success (someone else applied it)
      console.log(`[refundPlayer] Already refunded by another request for player ${playerId}`);
      return true;
    }
    // Wallet missing or other failure
    console.error(`[refundPlayer] FAILED - transaction aborted for player ${playerId}, escrowId: ${escrowId}`);
    return false;
  }

  // We applied the credit - log it
  try {
    await db.ref(`users/${playerId}/transactions`).push({
      type: 'refund',
      amount: amount,
      escrowId,
      description: `Escrow refund (${reason})`,
      timestamp,
    });
  } catch (e) {
    console.error(`[refundPlayer] WARN - log write failed for player ${playerId}:`, e);
  }

  console.log(`[refundPlayer] Refund applied for player ${playerId}`);
  return true;
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
      // Handle pending, locked, and refunding (stuck) escrows
      if (escrow.status === 'pending' || escrow.status === 'locked' || escrow.status === 'refunding') {
        console.log(`[cleanupExpiredEscrows] Processing expired escrow ${escrowId} (status: ${escrow.status})`);

        // Use shared helper for two-phase refund
        const result = await refundSingleEscrow(escrowId, 'expired');

        if (result.success) {
          refundedCount++;
          console.log(`[cleanupExpiredEscrows] Refunded expired escrow ${escrowId}`);
        } else if (result.error === 'in_progress') {
          console.log(`[cleanupExpiredEscrows] Escrow ${escrowId} refund in progress, will retry next run`);
        } else if (result.error === 'partial_failure') {
          console.error(`[cleanupExpiredEscrows] Partial failure for escrow ${escrowId}, will retry next run`);
        } else {
          console.log(`[cleanupExpiredEscrows] Escrow ${escrowId} skipped: ${result.error}`);
        }
      }
    }

    console.log(`[cleanupExpiredEscrows] Refunded ${refundedCount} expired escrows`);
  });
