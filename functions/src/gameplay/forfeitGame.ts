/**
 * Forfeit Game
 *
 * Handles game forfeits due to disconnect or manual forfeit.
 * Awards victory to the remaining player.
 *
 * Security:
 * - Only a player in the game can forfeit
 * - Players can only forfeit themselves (not opponent)
 * - Triggers escrow settlement if wagered game
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '../utils/rateLimit';
import { SETTLEMENT_LOCK_TIMEOUT_MS } from '../wagering/settlementConstants';

const db = admin.database();

interface ForfeitGameRequest {
  gameId: string;
  reason?: 'disconnect' | 'forfeit' | 'timeout';
  claimWin?: boolean; // If true, caller is claiming win because opponent disconnected
}

interface ForfeitGameResult {
  success: boolean;
  winner?: number;
  winnerId?: string;
  winnerPayout?: number;
  error?: string;
}

export const forfeitGame = functions
  .region('europe-west1')
  .https.onCall(async (data: ForfeitGameRequest, context): Promise<ForfeitGameResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in'
      );
    }

    const userId = context.auth.uid;
    const { gameId, reason = 'forfeit', claimWin = false } = data;

    // 1.5. Rate limiting
    await checkRateLimit(userId, 'forfeitGame', RATE_LIMITS.forfeitGame.limit, RATE_LIMITS.forfeitGame.windowMs);

    // 2. Validate request
    if (!gameId || typeof gameId !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid game ID'
      );
    }

    // 3. Fetch game state
    const gameRef = db.ref(`games/${gameId}`);
    const gameSnap = await gameRef.once('value');
    const game = gameSnap.val();

    if (!game) {
      throw new functions.https.HttpsError(
        'not-found',
        'Game not found'
      );
    }

    // 4. Verify game is still playing
    if (game.status !== 'playing') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Game is already finished'
      );
    }

    // 5. Determine player index (caller must be a player)
    let callerPlayerIndex: number;
    if (game.player1.id === userId) {
      callerPlayerIndex = 0;
    } else if (game.player2.id === userId) {
      callerPlayerIndex = 1;
    } else {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a player in this game'
      );
    }

    const now = Date.now();

    // 6. Determine winner based on claimWin flag
    // If claimWin is true, caller is claiming win because opponent disconnected
    // If claimWin is false, caller is forfeiting (opponent wins)
    let winnerIndex: number;
    let forfeitingPlayerIndex: number;

    if (claimWin) {
      // SECURITY: Verify opponent actually disconnected before allowing claimWin
      // This prevents fraud where a player falsely claims opponent disconnected
      const opponentPlayerKey = callerPlayerIndex === 0 ? 'player2' : 'player1';
      const opponent = game[opponentPlayerKey];

      const DISCONNECT_THRESHOLD_MS = 10000; // 10 seconds - reduced for faster forfeit detection
      const opponentLastHeartbeat = opponent.lastHeartbeat || 0;
      const heartbeatStale = (now - opponentLastHeartbeat) > DISCONNECT_THRESHOLD_MS;
      const opponentDisconnected = opponent.connected === false;

      // Must have EITHER stale heartbeat OR explicit disconnect flag
      if (!heartbeatStale && !opponentDisconnected) {
        console.log(`[forfeitGame] SECURITY: Rejected claimWin - opponent still connected`);
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Cannot claim win - opponent is still connected'
        );
      }

      console.log(`[forfeitGame] claimWin verified - opponent disconnect confirmed`);

      // Caller is claiming win (opponent disconnected - VERIFIED)
      winnerIndex = callerPlayerIndex;
      forfeitingPlayerIndex = callerPlayerIndex === 0 ? 1 : 0;
    } else {
      // Caller is forfeiting (opponent wins)
      forfeitingPlayerIndex = callerPlayerIndex;
      winnerIndex = callerPlayerIndex === 0 ? 1 : 0;
    }

    const winnerId = winnerIndex === 0 ? game.player1.id : game.player2.id;

    // 7. Update game state
    const updates: Record<string, unknown> = {
      status: 'finished',
      winner: winnerIndex,
      completedAt: now,
      forfeitedBy: forfeitingPlayerIndex,
      forfeitReason: reason,
    };

    await gameRef.update(updates);

    console.log(`[forfeitGame] Game forfeited successfully`);

    // 8. If wagered game, trigger settlement
    let winnerPayout = 0;
    if (game.wager && !game.wager.settled) {
      try {
        // Call settleGame internally and get payout
        // Returns 0 for already-settled/in-progress (idempotent skip)
        // Throws HttpsError on real failures
        winnerPayout = await settleGameInternal(gameId, winnerIndex, winnerId, game.wager.escrowId);
      } catch (error) {
        // Let HttpsError propagate to client (real failures must surface)
        if (error instanceof functions.https.HttpsError) {
          throw error;
        }
        // Wrap unexpected errors
        console.error(`[forfeitGame] Unexpected settlement error for game ${gameId}:`, error);
        throw new functions.https.HttpsError('internal', 'Settlement failed. Please retry.');
      }
    }

    return {
      success: true,
      winner: winnerIndex,
      winnerId,
      winnerPayout,
    };
  });

/**
 * Internal function to settle a wagered game
 * SECURITY: Uses atomic transaction on escrow to prevent double-payout race condition
 * Two-phase: locked → settling → (wallet credit) → released
 * Wallet idempotency: settleMarkers[escrowId] prevents double-credit
 * Returns the payout amount (0 only for already-settled/in-progress - throws on real failures)
 */
async function settleGameInternal(
  gameId: string,
  winnerIndex: number,
  winnerId: string,
  escrowId: string
): Promise<number> {
  const escrowRef = db.ref(`escrow/${escrowId}`);
  const now = Date.now();
  const requestId = `forfeit_${winnerId}_${randomUUID()}`;

  // Phase 1: Acquire settlement lock (locked → settling)
  const escrowResult = await escrowRef.transaction((escrow) => {
    if (!escrow) return; // Abort - escrow missing

    // Accept 'locked' or 'settling' (with stale check for takeover)
    if (escrow.status !== 'locked' && escrow.status !== 'settling') {
      console.log(`[settleGameInternal] Escrow already in terminal status: ${escrow.status}, aborting`);
      return; // Abort transaction
    }

    // For 'settling' status, verify lock is stale before allowing takeover
    if (escrow.status === 'settling') {
      const settlementAge = now - (escrow.settlementStartedAt || 0);
      if (settlementAge < SETTLEMENT_LOCK_TIMEOUT_MS) {
        console.log(`[settleGameInternal] Escrow still being settled (not stale), aborting`);
        return; // Abort - settlement in progress
      }
      console.log(`[settleGameInternal] Stale settling lock (>120s), allowing takeover`);
    }

    // SAFETY NET: Guards against partial rollback where status reverted to 'locked'
    // but settlementRequestId wasn't cleared (e.g., Firebase write interrupted).
    if (escrow.status === 'locked' && escrow.settlementRequestId) {
      const settlementAge = now - (escrow.settlementStartedAt || 0);
      if (settlementAge < SETTLEMENT_LOCK_TIMEOUT_MS) {
        console.log(`[settleGameInternal] Escrow has active settlement lock, aborting`);
        return; // Abort
      }
    }

    // Atomically acquire settlement lock
    return {
      ...escrow,
      status: 'settling',
      settlementStartedAt: now,
      settlementRequestId: requestId,
      winnerId,
    };
  });

  // Check if WE acquired the settlement lock
  const escrowAfterLock = escrowResult.snapshot.val();

  if (!escrowResult.committed || escrowAfterLock?.settlementRequestId !== requestId) {
    // Distinguish: missing escrow vs. already handled vs. unexpected state
    if (!escrowAfterLock) {
      console.error(`[settleGameInternal] CRITICAL: Escrow ${escrowId} missing for game ${gameId}`);
      throw new functions.https.HttpsError('internal', 'Escrow record missing. Cannot settle.');
    }

    const status = escrowAfterLock.status as string | undefined;
    if (status === 'released') {
      console.log(`[settleGameInternal] Escrow ${escrowId} already released, skipping`);
      return 0;
    }

    // locked can be a valid in-progress contention state (rollback race)
    if (status === 'settling' || status === 'locked') {
      console.log(`[settleGameInternal] Escrow ${escrowId} is ${status} by another process, skipping`);
      return 0;
    }

    // Truly unexpected state
    console.error(`[settleGameInternal] CRITICAL: Unexpected escrow state "${status}" for ${escrowId}`);
    throw new functions.https.HttpsError('internal', `Unexpected escrow state: ${status}`);
  }

  const totalPot = escrowAfterLock.totalPot;

  // Phase 2: Award coins to winner with idempotency marker
  const walletRef = db.ref(`users/${winnerId}/wallet`);

  const walletResult = await walletRef.transaction((wallet) => {
    if (!wallet) {
      console.error(`[settleGameInternal] CRITICAL: Wallet missing for user ${winnerId} during settlement of game ${gameId}`);
      return; // Abort - error handling below will rollback escrow and throw
    }

    // Idempotency: check if already settled
    if (wallet.settleMarkers?.[escrowId]) return; // Abort - already applied

    return {
      ...wallet,
      coins: (wallet.coins || 0) + totalPot,
      lifetimeEarnings: (wallet.lifetimeEarnings || 0) + totalPot,
      version: (wallet.version || 0) + 1,
      settleMarkers: {
        ...(wallet.settleMarkers || {}),
        [escrowId]: requestId,
      },
    };
  });

  let weAppliedCredit = walletResult.committed;

  if (!walletResult.committed) {
    // Follow-up read to check if already settled
    let checkSnap;
    try {
      checkSnap = await walletRef.child(`settleMarkers/${escrowId}`).once('value');
    } catch (e) {
      console.error(`[settleGameInternal] Marker read failed for ${winnerId}, escrowId: ${escrowId}:`, e);
      await escrowRef.update({
        status: 'locked',
        settlementRequestId: null,
        settlementStartedAt: null,
        settlementError: `marker_check_failed_${requestId}`,
        winnerId,
      });
      throw new functions.https.HttpsError('internal', 'Failed to verify settlement. Please retry.');
    }

    if (checkSnap.exists()) {
      // Already settled by another request - continue to finalize (idempotent)
      console.log(`[settleGameInternal] Already settled by another request for escrowId: ${escrowId}`);
    } else {
      // Real failure: wallet missing or transaction failed
      console.error(`[settleGameInternal] Wallet credit failed for ${winnerId} - releasing lock`);
      await escrowRef.update({
        status: 'locked',
        settlementRequestId: null,
        settlementStartedAt: null,
        settlementError: `wallet_failed_${requestId}`,
        winnerId,
      });
      throw new functions.https.HttpsError('internal', 'Failed to award payout. Please retry.');
    }
  }

  // Phase 3: Finalize escrow release
  await escrowRef.update({
    status: 'released',
    settledAt: now,
    payoutAwarded: true,
    settlementRequestId: null,
    settlementStartedAt: null,
    settlementError: null,
  });

  // Log transaction only if WE applied credit
  if (weAppliedCredit) {
    try {
      await db.ref(`users/${winnerId}/transactions`).push({
        type: 'payout',
        amount: totalPot,
        gameId,
        description: 'Wagered game win (forfeit)',
        timestamp: now,
      });
    } catch (e) {
      console.error(`[settleGameInternal] WARN - transaction log failed for ${winnerId}:`, e);
    }
  }

  // Mark game wager as settled
  await db.ref(`games/${gameId}/wager/settled`).set(true);

  console.log(`[settleGameInternal] Game settled - payout awarded to ${winnerId}`);

  return totalPot;
}
