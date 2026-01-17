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

const db = admin.database();

interface ForfeitGameRequest {
  gameId: string;
  reason?: 'disconnect' | 'forfeit' | 'timeout';
}

interface ForfeitGameResult {
  success: boolean;
  winner?: number;
  winnerId?: string;
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
    const { gameId, reason = 'forfeit' } = data;

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
    let forfeitingPlayerIndex: number;
    if (game.player1.id === userId) {
      forfeitingPlayerIndex = 0;
    } else if (game.player2.id === userId) {
      forfeitingPlayerIndex = 1;
    } else {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a player in this game'
      );
    }

    // 6. Determine winner (opponent of forfeiting player)
    const winnerIndex = forfeitingPlayerIndex === 0 ? 1 : 0;
    const winnerId = winnerIndex === 0 ? game.player1.id : game.player2.id;

    const now = Date.now();

    // 7. Update game state
    const updates: Record<string, unknown> = {
      status: 'finished',
      winner: winnerIndex,
      completedAt: now,
      forfeitedBy: forfeitingPlayerIndex,
      forfeitReason: reason,
    };

    await gameRef.update(updates);

    console.log(`[forfeitGame] Game ${gameId}: Player ${forfeitingPlayerIndex} forfeited (${reason}). Winner: Player ${winnerIndex}`);

    // 8. If wagered game, trigger settlement
    if (game.wager && !game.wager.settled) {
      try {
        // Call settleGame internally
        await settleGameInternal(gameId, winnerIndex, winnerId, game.wager.escrowId);
      } catch (error) {
        console.error(`[forfeitGame] Failed to settle wagered game ${gameId}:`, error);
        // Don't throw - game forfeit succeeded, settlement can be retried
      }
    }

    return {
      success: true,
      winner: winnerIndex,
      winnerId,
    };
  });

/**
 * Internal function to settle a wagered game
 * SECURITY: Uses atomic transaction on escrow to prevent double-payout race condition
 */
async function settleGameInternal(
  gameId: string,
  winnerIndex: number,
  winnerId: string,
  escrowId: string
): Promise<void> {
  const escrowRef = db.ref(`escrow/${escrowId}`);
  const now = Date.now();

  // CRITICAL: Use atomic transaction on escrow to prevent double-settlement race condition
  // This atomically checks status and transitions to 'released' in one operation
  const escrowResult = await escrowRef.transaction((escrow) => {
    if (!escrow) return escrow;

    // Already settled or not in locked state - abort transaction
    if (escrow.status !== 'locked') {
      console.log(`[settleGameInternal] Escrow ${escrowId} already in status: ${escrow.status}, aborting`);
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
    console.log(`[settleGameInternal] Escrow ${escrowId} already settled by another process, skipping payout`);
    return;
  }

  const escrow = escrowResult.snapshot.val();
  const totalPot = escrow.totalPot;

  // Now safe to award coins - escrow is atomically marked as released
  const walletRef = db.ref(`users/${winnerId}/wallet`);

  await walletRef.transaction((wallet) => {
    if (!wallet) return wallet;

    return {
      ...wallet,
      coins: (wallet.coins || 0) + totalPot,
      lifetimeEarnings: (wallet.lifetimeEarnings || 0) + totalPot,
      version: (wallet.version || 0) + 1,
    };
  });

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

  console.log(`[settleGameInternal] Settled game ${gameId}: ${winnerId} won ${totalPot} coins`);
}
