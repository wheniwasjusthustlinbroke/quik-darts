"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.settleGame = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const levelSystem_1 = require("../utils/levelSystem");
const db = admin.database();
exports.settleGame = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    const { gameId } = data;
    // 2. Validate request
    if (!gameId || typeof gameId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid game ID');
    }
    // 3. Fetch game
    const gameRef = db.ref(`games/${gameId}`);
    const gameSnap = await gameRef.once('value');
    const game = gameSnap.val();
    if (!game) {
        throw new functions.https.HttpsError('not-found', 'Game not found');
    }
    // 4. Verify caller is a player
    const isPlayer1 = game.player1.id === userId;
    const isPlayer2 = game.player2.id === userId;
    if (!isPlayer1 && !isPlayer2) {
        throw new functions.https.HttpsError('permission-denied', 'You are not a player in this game');
    }
    // 5. Verify game is finished
    if (game.status !== 'finished') {
        throw new functions.https.HttpsError('failed-precondition', 'Game is not finished yet');
    }
    // 6. Check winner exists
    if (game.winner !== 0 && game.winner !== 1) {
        throw new functions.https.HttpsError('failed-precondition', 'Game has no winner');
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
    console.log(`[settleGame] Settling game`);
    // 8. Award XP to both players
    const winnerXP = levelSystem_1.XP_REWARDS.GAME_PLAYED + levelSystem_1.XP_REWARDS.GAME_WON + (game.wager ? levelSystem_1.XP_REWARDS.GAME_WON_WAGERED : 0);
    const loserXP = levelSystem_1.XP_REWARDS.GAME_PLAYED;
    const xpAwarded = { winner: winnerXP, loser: loserXP };
    let levelUp;
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
        // CRITICAL: Use atomic transaction on escrow to prevent double-settlement race condition
        // This transaction atomically checks status and transitions to 'released' in one operation
        const escrowResult = await escrowRef.transaction((escrow) => {
            if (!escrow)
                return escrow;
            // Already settled or not in locked state - abort transaction
            if (escrow.status !== 'locked') {
                console.log(`[settleGame] Escrow ${game.wager.escrowId} already in status: ${escrow.status}, aborting`);
                return; // Abort transaction
            }
            // Atomically transition escrow to released state
            return {
                ...escrow,
                status: 'released',
                settledAt: now,
                winnerId,
            };
        });
        // Check if escrow transaction was committed
        if (escrowResult.committed && escrowResult.snapshot.val()?.status === 'released') {
            const escrow = escrowResult.snapshot.val();
            payout = escrow.totalPot;
            // Now award coins to winner (safe - escrow is already atomically marked as released)
            const walletRef = db.ref(`users/${winnerId}/wallet`);
            const walletResult = await walletRef.transaction((wallet) => {
                if (!wallet)
                    return wallet;
                return {
                    ...wallet,
                    coins: (wallet.coins || 0) + payout,
                    lifetimeEarnings: (wallet.lifetimeEarnings || 0) + payout,
                    version: (wallet.version || 0) + 1,
                };
            });
            if (!walletResult.committed) {
                console.error(`[settleGame] Failed to award ${payout} coins to ${winnerId} - wallet transaction failed`);
            }
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
        else {
            // Escrow was already settled by another concurrent call
            console.log(`[settleGame] Escrow already settled, skipping payout`);
        }
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
async function awardXP(userId, xpAmount, timestamp) {
    const progressionRef = db.ref(`users/${userId}/progression`);
    const result = await progressionRef.transaction((progression) => {
        if (!progression) {
            progression = { xp: 0, level: 1, gamesPlayed: 0, gamesWon: 0 };
        }
        const oldXP = progression.xp || 0;
        const newXP = oldXP + xpAmount;
        const newLevel = (0, levelSystem_1.getLevelFromXP)(newXP);
        return {
            ...progression,
            xp: newXP,
            level: newLevel,
        };
    });
    if (result.committed) {
        const oldLevel = (0, levelSystem_1.getLevelFromXP)((result.snapshot.val()?.xp || 0) - xpAmount);
        const newLevel = result.snapshot.val()?.level || 1;
        // Check for level up
        if (newLevel > oldLevel) {
            const coinsAwarded = (0, levelSystem_1.getLevelUpCoins)(newLevel);
            // Award level up coins
            const walletRef = db.ref(`users/${userId}/wallet`);
            await walletRef.transaction((wallet) => {
                if (!wallet)
                    return wallet;
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
async function updateProgression(userId, won) {
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
        }
        else {
            return {
                ...streaks,
                currentWinStreak: 0,
            };
        }
    });
}
//# sourceMappingURL=settleGame.js.map