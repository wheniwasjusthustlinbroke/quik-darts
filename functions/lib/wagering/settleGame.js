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
 * - Prevents double settlement with requestId-based settlement lock
 * - Uses atomic transaction for coin transfer
 * - Recoverable: if wallet update fails, settlement lock is released for retry
 * - Winner ID derived from server-authoritative game state, not user input
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
const node_crypto_1 = require("node:crypto");
const levelSystem_1 = require("../utils/levelSystem");
const rateLimit_1 = require("../utils/rateLimit");
const settlementConstants_1 = require("./settlementConstants");
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
    // 1.5. Rate limiting
    await (0, rateLimit_1.checkRateLimit)(userId, 'settleGame', rateLimit_1.RATE_LIMITS.settleGame.limit, rateLimit_1.RATE_LIMITS.settleGame.windowMs);
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
    // SECURITY: Generate unique request ID to track this settlement attempt
    // This prevents race conditions where two requests could both try to settle
    const requestId = `settle_${userId}_${(0, node_crypto_1.randomUUID)()}`;
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
        // CRITICAL: Use atomic transaction with settlement lock to prevent double-settlement
        // The settlementRequestId ensures only one request can proceed with wallet update
        const escrowResult = await escrowRef.transaction((escrow) => {
            if (!escrow)
                return; // Abort - escrow missing
            // Accept 'locked' or 'settling' (with stale check for takeover)
            if (escrow.status !== 'locked' && escrow.status !== 'settling') {
                console.log(`[settleGame] Escrow ${game.wager.escrowId} already in status: ${escrow.status}, aborting`);
                return; // Abort transaction
            }
            // For 'settling' status, verify lock is stale before allowing takeover
            if (escrow.status === 'settling') {
                const settlementAge = now - (escrow.settlementStartedAt || 0);
                if (settlementAge < settlementConstants_1.SETTLEMENT_LOCK_TIMEOUT_MS) {
                    console.log(`[settleGame] Escrow ${game.wager.escrowId} still being settled (not stale), aborting`);
                    return; // Abort - settlement in progress
                }
                console.log(`[settleGame] Stale settling lock (>120s), allowing takeover`);
            }
            // SECURITY: Also check for stale lock on 'locked' status with requestId
            // (edge case: partial update set requestId but not status)
            if (escrow.status === 'locked' && escrow.settlementRequestId) {
                const settlementAge = now - (escrow.settlementStartedAt || 0);
                if (settlementAge < settlementConstants_1.SETTLEMENT_LOCK_TIMEOUT_MS) {
                    console.log(`[settleGame] Escrow ${game.wager.escrowId} already being settled by ${escrow.settlementRequestId}`);
                    return; // Abort - another request is settling
                }
                console.log(`[settleGame] Stale settlement lock on locked status (>120s), allowing retry`);
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
            if (!escrowAfterLock) {
                console.error(`[settleGame] CRITICAL: Escrow ${game.wager.escrowId} missing for game ${gameId}`);
                throw new functions.https.HttpsError('internal', 'Escrow record missing. Cannot settle.');
            }
            const status = escrowAfterLock.status;
            if (status === 'released') {
                console.log(`[settleGame] Escrow ${game.wager.escrowId} already released, skipping`);
                return {
                    success: true,
                    winnerId: escrowAfterLock.winnerId ?? winnerId,
                    payout: escrowAfterLock.totalPot ?? 0,
                    error: 'Already settled',
                };
            }
            // locked can be a valid in-progress contention state (rollback race)
            if (status === 'settling' || status === 'locked') {
                console.log(`[settleGame] Escrow ${game.wager.escrowId} is ${status} by another process, skipping`);
                return {
                    success: true,
                    winnerId,
                    error: 'Settlement in progress',
                };
            }
            console.error(`[settleGame] CRITICAL: Unexpected escrow state "${status}" for ${game.wager.escrowId}`);
            throw new functions.https.HttpsError('internal', `Unexpected escrow state: ${status}`);
        }
        payout = escrowAfterLock.totalPot;
        const escrowId = game.wager.escrowId;
        // Now award coins to winner (safe - we own the settlement lock)
        const walletRef = db.ref(`users/${winnerId}/wallet`);
        const walletResult = await walletRef.transaction((wallet) => {
            if (!wallet)
                return; // Abort - wallet missing
            // Idempotency: check if already settled by this or another request
            if (wallet.settleMarkers?.[escrowId])
                return; // Abort - already applied
            return {
                ...wallet,
                coins: (wallet.coins || 0) + payout,
                lifetimeEarnings: (wallet.lifetimeEarnings || 0) + payout,
                version: (wallet.version || 0) + 1,
                settleMarkers: {
                    ...(wallet.settleMarkers || {}),
                    [escrowId]: requestId,
                },
            };
        });
        // Track whether WE applied the credit (for transaction log)
        let weAppliedCredit = walletResult.committed;
        // Handle abort cases
        if (!walletResult.committed) {
            // Follow-up read to distinguish "already settled" from "wallet missing"
            let checkSnap;
            try {
                checkSnap = await walletRef.child(`settleMarkers/${escrowId}`).once('value');
            }
            catch (e) {
                console.error(`[settleGame] Marker read failed for ${winnerId}, escrowId: ${escrowId}:`, e);
                // Can't determine state - release lock for retry
                await escrowRef.update({
                    status: 'locked',
                    settlementRequestId: null,
                    settlementStartedAt: null,
                    settlementError: `marker_check_failed_${requestId}`,
                    winnerId,
                });
                throw new functions.https.HttpsError('internal', 'Failed to verify settlement. Please try again.');
            }
            if (checkSnap.exists()) {
                // Marker exists - idempotent success (another request applied it)
                console.log(`[settleGame] Already settled by another request for escrowId: ${escrowId}`);
                // Continue to finalize escrow (it may already be released, but update is idempotent)
            }
            else {
                // Wallet missing or other failure - release lock for retry
                console.error(`[settleGame] Failed to award ${payout} coins to ${winnerId} - wallet transaction failed`);
                await escrowRef.update({
                    status: 'locked',
                    settlementRequestId: null,
                    settlementStartedAt: null,
                    settlementError: `wallet_update_failed_${requestId}`,
                    winnerId,
                });
                throw new functions.https.HttpsError('internal', 'Failed to award payout. Please try again.');
            }
        }
        // Finalize escrow release (idempotent - safe even if already released)
        await escrowRef.update({
            status: 'released',
            settledAt: now,
            payoutAwarded: true,
            settlementRequestId: null,
            settlementStartedAt: null,
            settlementError: null,
        });
        // Log transaction ONLY if WE applied the credit
        if (weAppliedCredit) {
            try {
                await db.ref(`users/${winnerId}/transactions`).push({
                    type: 'payout',
                    amount: payout,
                    gameId,
                    description: `Won wagered match (+${payout} coins)`,
                    timestamp: now,
                });
            }
            catch (e) {
                console.error(`[settleGame] WARN - transaction log failed for ${winnerId}:`, e);
            }
        }
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
                if (!wallet) {
                    console.error(`[awardXP] Wallet missing for user ${userId}; cannot award level-up coins`);
                    return; // Abort
                }
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