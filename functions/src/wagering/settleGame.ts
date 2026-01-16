/**
 * Settle Game
 *
 * Settles a wagered game by releasing escrow to the winner.
 * Called automatically when a game ends or on forfeit.
 *
 * Security:
 * - Only callable by players in the game
 * - Verifies game is finished
 * - Prevents double settlement
 * - Uses atomic transaction for coin transfer
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

    const winnerId = game.winner === 0 ? game.player1.id : game.player2.id;
    const loserId = game.winner === 0 ? game.player2.id : game.player1.id;
    const now = Date.now();

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

    // 9. Handle wagered game settlement
    let payout = 0;
    if (game.wager && game.wager.escrowId) {
      const escrowRef = db.ref(`escrow/${game.wager.escrowId}`);
      const escrowSnap = await escrowRef.once('value');
      const escrow = escrowSnap.val();

      if (escrow && escrow.status === 'locked') {
        payout = escrow.totalPot;

        // Atomic transaction: award coins to winner
        const walletRef = db.ref(`users/${winnerId}/wallet`);

        await walletRef.transaction((wallet) => {
          if (!wallet) return wallet;

          return {
            ...wallet,
            coins: (wallet.coins || 0) + payout,
            lifetimeEarnings: (wallet.lifetimeEarnings || 0) + payout,
            version: (wallet.version || 0) + 1,
          };
        });

        // Log transaction
        await db.ref(`users/${winnerId}/transactions`).push({
          type: 'payout',
          amount: payout,
          gameId,
          description: `Won wagered match (+${payout} coins)`,
          timestamp: now,
        });

        // Update escrow status
        await escrowRef.update({
          status: 'released',
          settledAt: now,
          winnerId,
        });

        console.log(`[settleGame] Game ${gameId}: ${winnerId} won ${payout} coins`);
      }
    }

    // 10. Mark game as settled
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

      console.log(`[awardXP] User ${userId} leveled up to ${newLevel}, awarded ${coinsAwarded} coins`);

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
