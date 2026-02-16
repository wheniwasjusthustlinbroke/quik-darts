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
import { checkRateLimit, RATE_LIMITS } from '../utils/rateLimit';

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
        winnerPayout = await settleGameInternal(gameId, winnerIndex, winnerId, game.wager.escrowId);
      } catch (error) {
        console.error(`[forfeitGame] Failed to settle wagered game:`, error);
        // Don't throw - game forfeit succeeded, settlement can be retried
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
 * Returns the payout amount (0 if already settled)
 */
async function settleGameInternal(
  gameId: string,
  winnerIndex: number,
  winnerId: string,
  escrowId: string
): Promise<number> {
  const escrowRef = db.ref(`escrow/${escrowId}`);
  const now = Date.now();

  // CRITICAL: Use atomic transaction on escrow to prevent double-settlement race condition
  // This atomically checks status and transitions to 'released' in one operation
  const escrowResult = await escrowRef.transaction((escrow) => {
    if (!escrow) return escrow;

    // Already settled or not in locked state - abort transaction
    if (escrow.status !== 'locked') {
      console.log(`[settleGameInternal] Escrow already processed, aborting`);
      return; // Abort transaction - returns undefined
    }

    // Atomically transition escrow to released state
    return {
      ...escrow,
      status: 'released',
      settledAt: now,
      winnerId,
    };
  });

  // Check if escrow transaction was committed (status was 'locked' and we changed it)
  if (!escrowResult.committed || escrowResult.snapshot.val()?.status !== 'released') {
    console.log(`[settleGameInternal] Escrow already settled by another process, skipping payout`);
    return 0;
  }

  const escrow = escrowResult.snapshot.val();
  const totalPot = escrow.totalPot;

  // Now safe to award coins - escrow is atomically marked as released
  const walletRef = db.ref(`users/${winnerId}/wallet`);

  const walletResult = await walletRef.transaction((wallet) => {
    if (!wallet) return wallet;

    return {
      ...wallet,
      coins: (wallet.coins || 0) + totalPot,
      lifetimeEarnings: (wallet.lifetimeEarnings || 0) + totalPot,
      version: (wallet.version || 0) + 1,
    };
  });

  if (!walletResult.committed) {
    console.error(`[settleGameInternal] Wallet credit failed - rolling back escrow`);
    try {
      await escrowRef.update({
        status: 'locked',
        settledAt: null,        // Clear release markers
        winnerId,               // Keep for retry
        settlementError: `wallet_failed_${Date.now()}`,
      });
    } catch (rollbackErr) {
      console.error(`[settleGameInternal] CRITICAL: Rollback failed!`, rollbackErr);
      // Manual intervention needed - escrow stuck in released without payout
    }
    return 0; // Return before logging transaction - payout not awarded
  }

  // Log transaction
  await db.ref(`users/${winnerId}/transactions`).push({
    type: 'payout',
    amount: totalPot,
    gameId,
    description: 'Wagered game win',
    timestamp: now,
  });

  // Mark game wager as settled
  await db.ref(`games/${gameId}/wager/settled`).set(true);

  console.log(`[settleGameInternal] Game settled - payout awarded`);

  return totalPot;
}
