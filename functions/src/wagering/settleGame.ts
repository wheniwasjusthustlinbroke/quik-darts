/**
 * Settle Game
 *
 * Settles a wagered game by releasing escrow to the winner.
 * Called automatically when a game ends or on forfeit.
 *
 * Security:
 * - Only callable by players in the game
 * - Verifies game is finished
 * - Prevents double settlement with requestId-based settlement lock
 * - Uses atomic transaction for coin transfer
 * - Recoverable: if wallet update fails, settlement lock is released for retry
 * - Winner ID derived from server-authoritative game state, not user input
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getLevelFromXP, getLevelUpCoins, XP_REWARDS } from '../utils/levelSystem';

const db = admin.database();

interface SettleGameRequest {
  gameId: string;
}

interface SettleGameResult {
  success: boolean;
  winnerId?: string;
  payout?: number;
  xpAwarded?: { winner: number; loser: number };
  levelUp?: { userId: string; newLevel: number; coinsAwarded: number };
  error?: string;
}

export const settleGame = functions
  .region('europe-west1')
  .https.onCall(async (data: SettleGameRequest, context): Promise<SettleGameResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in'
      );
    }

    const userId = context.auth.uid;
    const { gameId } = data;

    // 2. Validate request
    if (!gameId || typeof gameId !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid game ID'
      );
    }

    // 3. Fetch game
    const gameRef = db.ref(`games/${gameId}`);
    const gameSnap = await gameRef.once('value');
    const game = gameSnap.val();

    if (!game) {
      throw new functions.https.HttpsError(
        'not-found',
        'Game not found'
      );
    }

    // 4. Verify caller is a player
    const isPlayer1 = game.player1.id === userId;
    const isPlayer2 = game.player2.id === userId;
    if (!isPlayer1 && !isPlayer2) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a player in this game'
      );
    }

    // 5. Verify game is finished
    if (game.status !== 'finished') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Game is not finished yet'
      );
    }

    // 6. Check winner exists
    if (game.winner !== 0 && game.winner !== 1) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Game has no winner'
      );
    }

    // 7. Check if already settled
    if (game.wager?.settled) {
      return {
        success: true,
        winnerId: game.winner === 0 ? game.player1.id : game.player2.id,
        payout: game.wager.stakeAmount * 2,
        error: 'Already settled',
      };
    }

    // SECURITY: winnerId is derived from game state (game.winner), not user input
    // This prevents settlement fraud - winner cannot be manipulated by caller
    const winnerId = game.winner === 0 ? game.player1.id : game.player2.id;
    const loserId = game.winner === 0 ? game.player2.id : game.player1.id;
    const now = Date.now();

    // SECURITY: Generate unique request ID to track this settlement attempt
    // This prevents race conditions where two requests could both try to settle
    const requestId = `${userId}_${now}_${Math.random().toString(36).substring(2, 8)}`;

    console.log(`[settleGame] Settling game`);

    // 8. Award XP to both players
    const winnerXP = XP_REWARDS.GAME_PLAYED + XP_REWARDS.GAME_WON + (game.wager ? XP_REWARDS.GAME_WON_WAGERED : 0);
    const loserXP = XP_REWARDS.GAME_PLAYED;

    const xpAwarded = { winner: winnerXP, loser: loserXP };
    let levelUp: { userId: string; newLevel: number; coinsAwarded: number } | undefined;

    // Award XP to winner
    const winnerLevelUp = await awardXP(winnerId, winnerXP, now);
    if (winnerLevelUp) {
      levelUp = { userId: winnerId, ...winnerLevelUp };
    }

    // Award XP to loser
    await awardXP(loserId, loserXP, now);

    // 9. Handle wagered game settlement with atomic escrow state transition
    let payout = 0;
    if (game.wager && game.wager.escrowId) {
      const escrowRef = db.ref(`escrow/${game.wager.escrowId}`);

      // CRITICAL: Use atomic transaction with settlement lock to prevent double-settlement
      // The settlementRequestId ensures only one request can proceed with wallet update
      const escrowResult = await escrowRef.transaction((escrow) => {
        if (!escrow) return escrow;

        // Already settled or not in locked state - abort transaction
        if (escrow.status !== 'locked') {
          console.log(`[settleGame] Escrow ${game.wager.escrowId} already in status: ${escrow.status}, aborting`);
          return; // Abort transaction
        }

        // SECURITY: Check if another request is already settling this escrow
        // If settlement started but not completed, allow retry after 30 seconds
        if (escrow.settlementRequestId) {
          const settlementAge = now - (escrow.settlementStartedAt || 0);
          if (settlementAge < 30000) {
            console.log(`[settleGame] Escrow ${game.wager.escrowId} already being settled by ${escrow.settlementRequestId}`);
            return; // Abort - another request is settling
          }
          // Stale settlement lock - allow retry
          console.log(`[settleGame] Stale settlement lock, allowing retry`);
        }

        // Atomically acquire settlement lock
        return {
          ...escrow,
          status: 'settling', // Intermediate state to signal settlement in progress
          settlementStartedAt: now,
          settlementRequestId: requestId,
          winnerId,
        };
      });

      // Check if WE acquired the settlement lock
      const escrowAfterLock = escrowResult.snapshot.val();
      if (!escrowResult.committed || escrowAfterLock?.settlementRequestId !== requestId) {
        // Another request is settling or escrow was already released
        console.log(`[settleGame] Could not acquire settlement lock, skipping`);
        // Return success since game is being/was settled (idempotent)
        return {
          success: true,
          winnerId,
          error: 'Settlement in progress or already complete',
        };
      }

      payout = escrowAfterLock.totalPot;

      // Now award coins to winner (safe - we own the settlement lock)
      const walletRef = db.ref(`users/${winnerId}/wallet`);

      const walletResult = await walletRef.transaction((wallet) => {
        if (!wallet) return wallet;

        return {
          ...wallet,
          coins: (wallet.coins || 0) + payout,
          lifetimeEarnings: (wallet.lifetimeEarnings || 0) + payout,
          version: (wallet.version || 0) + 1,
        };
      });

      if (!walletResult.committed) {
        // CRITICAL: Wallet update failed - release the settlement lock so another attempt can retry
        console.error(`[settleGame] Failed to award ${payout} coins to ${winnerId} - wallet transaction failed`);
        await escrowRef.update({
          status: 'locked', // Reset to locked so retry is possible
          settlementRequestId: null,
          settlementStartedAt: null,
          settlementError: `wallet_update_failed_${requestId}`,
          winnerId, // Keep winner ID for retry
        });
        throw new functions.https.HttpsError(
          'internal',
          'Failed to award payout. Please try again.'
        );
      }

      // Wallet update succeeded - finalize escrow release
      await escrowRef.update({
        status: 'released',
        settledAt: now,
        payoutAwarded: true,
      });

      // Log transaction
      await db.ref(`users/${winnerId}/transactions`).push({
        type: 'payout',
        amount: payout,
        gameId,
        description: `Won wagered match (+${payout} coins)`,
        timestamp: now,
      });

      console.log(`[settleGame] Payout awarded to winner`);
    }

    // 10. Mark game as settled (idempotent)
    await gameRef.child('wager/settled').set(true);

    // 11. Update progression stats for both players
    await updateProgression(winnerId, true);
    await updateProgression(loserId, false);

    return {
      success: true,
      winnerId,
      payout,
      xpAwarded,
      levelUp,
    };
  });

/**
 * Award XP to a user and handle level up
 */
async function awardXP(
  userId: string,
  xpAmount: number,
  timestamp: number
): Promise<{ newLevel: number; coinsAwarded: number } | null> {
  const progressionRef = db.ref(`users/${userId}/progression`);

  const result = await progressionRef.transaction((progression) => {
    if (!progression) {
      progression = { xp: 0, level: 1, gamesPlayed: 0, gamesWon: 0 };
    }

    const oldXP = progression.xp || 0;
    const newXP = oldXP + xpAmount;
    const newLevel = getLevelFromXP(newXP);

    return {
      ...progression,
      xp: newXP,
      level: newLevel,
    };
  });

  if (result.committed) {
    const oldLevel = getLevelFromXP((result.snapshot.val()?.xp || 0) - xpAmount);
    const newLevel = result.snapshot.val()?.level || 1;

    // Check for level up
    if (newLevel > oldLevel) {
      const coinsAwarded = getLevelUpCoins(newLevel);

      // Award level up coins
      const walletRef = db.ref(`users/${userId}/wallet`);
      await walletRef.transaction((wallet) => {
        if (!wallet) return wallet;

        return {
          ...wallet,
          coins: (wallet.coins || 0) + coinsAwarded,
          lifetimeEarnings: (wallet.lifetimeEarnings || 0) + coinsAwarded,
          version: (wallet.version || 0) + 1,
        };
      });

      // Log transaction
      await db.ref(`users/${userId}/transactions`).push({
        type: 'levelup',
        amount: coinsAwarded,
        description: `Reached level ${newLevel}`,
        timestamp,
      });

      console.log(`[awardXP] Player leveled up to ${newLevel}`);

      return { newLevel, coinsAwarded };
    }
  }

  return null;
}

/**
 * Update user progression stats
 */
async function updateProgression(userId: string, won: boolean): Promise<void> {
  const progressionRef = db.ref(`users/${userId}/progression`);
  const streaksRef = db.ref(`users/${userId}/streaks`);

  await progressionRef.transaction((progression) => {
    if (!progression) {
      progression = { xp: 0, level: 1, gamesPlayed: 0, gamesWon: 0 };
    }

    return {
      ...progression,
      gamesPlayed: (progression.gamesPlayed || 0) + 1,
      gamesWon: won ? (progression.gamesWon || 0) + 1 : progression.gamesWon || 0,
    };
  });

  // Update streaks
  await streaksRef.transaction((streaks) => {
    if (!streaks) {
      streaks = { currentWinStreak: 0, bestWinStreak: 0 };
    }

    if (won) {
      const newStreak = (streaks.currentWinStreak || 0) + 1;
      return {
        currentWinStreak: newStreak,
        bestWinStreak: Math.max(newStreak, streaks.bestWinStreak || 0),
      };
    } else {
      return {
        ...streaks,
        currentWinStreak: 0,
      };
    }
  });
}
