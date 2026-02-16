"use strict";
/**
 * Create Game
 *
 * Creates a new game room for online multiplayer.
 * For wagered games, escrow must be created first.
 *
 * Security:
 * - Validates both players exist
 * - For wagered games: verifies escrow is locked
 * - Only server can create game rooms
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
exports.createGame = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const rateLimit_1 = require("../utils/rateLimit");
const db = admin.database();
exports.createGame = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    // 1.5. Rate limiting
    await (0, rateLimit_1.checkRateLimit)(userId, 'createGame', rateLimit_1.RATE_LIMITS.createGame.limit, rateLimit_1.RATE_LIMITS.createGame.windowMs);
    // 2. Validate request
    const { player1Id, player1Name, player1Flag, player2Id, player2Name, player2Flag, gameMode, isWagered, stakeAmount, escrowId, } = data;
    // Caller must be one of the players
    if (userId !== player1Id && userId !== player2Id) {
        throw new functions.https.HttpsError('permission-denied', 'You must be a player in this game');
    }
    // Validate game mode
    if (gameMode !== 301 && gameMode !== 501) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid game mode. Must be 301 or 501.');
    }
    // Validate player IDs are valid strings
    if (!player1Id || typeof player1Id !== 'string' || player1Id.length > 128) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid player1 ID');
    }
    if (!player2Id || typeof player2Id !== 'string' || player2Id.length > 128) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid player2 ID');
    }
    if (player1Id === player2Id) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot play against yourself');
    }
    // 3. For wagered games, verify escrow
    if (isWagered) {
        if (!escrowId || !stakeAmount) {
            throw new functions.https.HttpsError('invalid-argument', 'Wagered games require escrowId and stakeAmount');
        }
        const escrowSnap = await db.ref(`escrow/${escrowId}`).once('value');
        const escrow = escrowSnap.val();
        if (!escrow) {
            throw new functions.https.HttpsError('not-found', 'Escrow not found');
        }
        if (escrow.status !== 'locked') {
            throw new functions.https.HttpsError('failed-precondition', 'Escrow must be locked before creating game');
        }
        // Verify escrow matches players
        const escrowPlayers = [escrow.player1?.userId, escrow.player2?.userId];
        if (!escrowPlayers.includes(player1Id) || !escrowPlayers.includes(player2Id)) {
            throw new functions.https.HttpsError('invalid-argument', 'Escrow players do not match game players');
        }
    }
    // Database URL for diagnostics (used in both casual and wagered flows)
    const dbUrl = db.app.options.databaseURL ?? 'UNDEFINED';
    // 3b. For casual games, atomically claim opponent (transaction prevents race)
    let casualGameId = null;
    if (!isWagered) {
        // Pre-generate gameId BEFORE transaction
        casualGameId = db.ref('games').push().key;
        if (!casualGameId) {
            throw new functions.https.HttpsError('internal', 'Failed to generate game id');
        }
        const queuePath = `matchmaking_queue/casual/${player1Id}`;
        const queueEntryRef = db.ref(queuePath);
        console.log(`[createGame] Request context:`, {
            callerUid: userId,
            player1Id,
            player2Id,
            gameMode,
            isWagered,
            queuePath,
            dbUrl,
        });
        // Atomic claim via parent-node transaction.
        // Admin SDK may pass null on first callback (no local cache). Returning undefined
        // aborts immediately. Returning null does NOT abort - it proposes null as the new
        // value, triggering a server round-trip. If server value differs (entry exists),
        // Firebase's built-in retry mechanism calls the callback again with the real value.
        let abortReason = null;
        const claimResult = await queueEntryRef.transaction((entry) => {
            if (!entry) {
                abortReason = 'missing_entry_probe';
                return null; // Don't abort; let built-in retry fetch real value if it exists
            }
            if (entry.matchedGameId) {
                abortReason = 'already_matched';
                return; // abort
            }
            if (entry.gameMode && entry.gameMode !== gameMode) {
                abortReason = 'mode_mismatch';
                return; // abort
            }
            abortReason = 'claimed';
            return {
                ...entry,
                matchedGameId: casualGameId,
                matchedByName: sanitizeName(player2Name),
                matchedByFlag: sanitizeFlag(player2Flag),
            };
        });
        const claimed = claimResult.snapshot?.val();
        console.log(`[createGame] Transaction result:`, {
            committed: claimResult.committed,
            abortReason,
            claimedGameId: claimed?.matchedGameId ?? null,
            claimedPlayerId: claimed?.playerId ?? null,
        });
        // Verify claim succeeded with valid data (catches true missing entry, race conditions, malformed data)
        if (!claimResult.committed || !claimed || claimed.matchedGameId !== casualGameId || !claimed.playerId) {
            throw new functions.https.HttpsError('failed-precondition', 'Opponent not available', {
                abortReason,
                queuePath,
                dbUrl,
            });
        }
    }
    // 3c. For wagered games, atomically claim opponent (transaction prevents race)
    let wageredGameId = null;
    let wageredStakeLevel = null;
    if (isWagered && stakeAmount) {
        // Validate and normalize stakeLevel (capture once, reuse in rollback)
        wageredStakeLevel = String(stakeAmount);
        if (!['50', '100', '500', '2500'].includes(wageredStakeLevel)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid stake level');
        }
        // Pre-generate gameId BEFORE transaction
        wageredGameId = db.ref('games').push().key;
        if (!wageredGameId) {
            throw new functions.https.HttpsError('internal', 'Failed to generate game id');
        }
        const wageredQueuePath = `matchmaking_queue/wagered/${wageredStakeLevel}/${player1Id}`;
        const queueEntryRef = db.ref(wageredQueuePath);
        // Atomic claim via parent-node transaction (same fix as casual flow)
        let abortReason = null;
        const claimResult = await queueEntryRef.transaction((entry) => {
            if (!entry) {
                abortReason = 'missing_entry_probe';
                return null; // Don't abort; let built-in retry fetch real value if it exists
            }
            if (entry.matchedGameId) {
                abortReason = 'already_matched';
                return; // abort
            }
            if (entry.gameMode && entry.gameMode !== gameMode) {
                abortReason = 'mode_mismatch';
                return; // abort
            }
            abortReason = 'claimed';
            return {
                ...entry,
                matchedGameId: wageredGameId,
                matchedByName: sanitizeName(player2Name),
                matchedByFlag: sanitizeFlag(player2Flag),
            };
        });
        const claimed = claimResult.snapshot?.val();
        if (!claimResult.committed || !claimed || claimed.matchedGameId !== wageredGameId || !claimed.playerId) {
            throw new functions.https.HttpsError('failed-precondition', 'Opponent not available', {
                abortReason,
                queuePath: wageredQueuePath,
                dbUrl,
            });
        }
    }
    // 4. Create game room
    // Use pre-generated gameId if available, otherwise generate new
    const preGeneratedId = casualGameId || wageredGameId;
    const fallbackId = preGeneratedId ? null : db.ref('games').push().key;
    if (!preGeneratedId && !fallbackId) {
        throw new functions.https.HttpsError('internal', 'Failed to generate game id');
    }
    const gameId = (preGeneratedId ?? fallbackId);
    const gameRef = db.ref(`games/${gameId}`);
    try {
        const now = Date.now();
        const gameData = {
            player1: {
                id: player1Id,
                name: sanitizeName(player1Name),
                flag: sanitizeFlag(player1Flag),
                score: gameMode,
                ready: true,
                connected: false, // Will be set when player1 joins
                lastHeartbeat: now,
            },
            player2: {
                id: player2Id,
                name: sanitizeName(player2Name),
                flag: sanitizeFlag(player2Flag),
                score: gameMode,
                ready: true,
                connected: true, // Player2 creates the game, so they're connected
                lastHeartbeat: now,
            },
            currentPlayer: 0, // Player 1 starts
            gameMode,
            dartsThrown: 0,
            currentTurnScore: 0,
            throwHistory: {},
            dartPositions: {},
            legScores: { 0: 0, 1: 0 },
            setScores: { 0: 0, 1: 0 },
            // O(1) per-player throw counters (avoids throwHistory scan for RNG seed)
            playerTotalDarts: [0, 0],
            // Per-player perfect hit COUNT this turn (legacy, kept for backward compat)
            perfectHitsThisTurn: [0, 0],
            // Per-player accumulated SHRINK AMOUNT this turn (0, 1.5, 3, 4.5, ...)
            // Used for dynamic zone width calculation. Resets each turn.
            perfectShrinkThisTurn: [0, 0],
            status: 'playing',
            createdAt: now,
            ...(isWagered && {
                wager: {
                    stakeAmount,
                    escrowId,
                    settled: false,
                },
            }),
        };
        await gameRef.set(gameData);
        // Link escrow to game (for active game detection in refund paths)
        if (isWagered && escrowId) {
            await db.ref(`escrow/${escrowId}`).update({
                gameId,
                gameCreatedAt: now,
            });
        }
    }
    catch (error) {
        // Conditional rollback: only clear if still our claim
        if (!isWagered && casualGameId) {
            const rollbackResult = await db.ref(`matchmaking_queue/casual/${player1Id}/matchedGameId`).transaction((current) => {
                if (current === casualGameId)
                    return null;
                return; // abort - someone else's claim
            });
            if (rollbackResult.committed) {
                await db.ref(`matchmaking_queue/casual/${player1Id}`).update({
                    matchedByName: null,
                    matchedByFlag: null,
                });
            }
        }
        if (isWagered && wageredGameId && wageredStakeLevel) {
            const rollbackResult = await db.ref(`matchmaking_queue/wagered/${wageredStakeLevel}/${player1Id}/matchedGameId`).transaction((current) => {
                if (current === wageredGameId)
                    return null;
                return; // abort - someone else's claim
            });
            if (rollbackResult.committed) {
                await db.ref(`matchmaking_queue/wagered/${wageredStakeLevel}/${player1Id}`).update({
                    matchedByName: null,
                    matchedByFlag: null,
                });
            }
        }
        throw error;
    }
    console.log(`[createGame] Created game ${gameId} between ${player1Id} and ${player2Id}`);
    return {
        success: true,
        gameId: gameId,
    };
});
// Sanitize player name
function sanitizeName(name) {
    if (!name || typeof name !== 'string')
        return 'Player';
    return name
        .slice(0, 20)
        .replace(/[^a-zA-Z0-9\s\-_.!?]/g, '')
        .replace(/\s+/g, ' ')
        .trim() || 'Player';
}
// Sanitize flag (allow emojis)
function sanitizeFlag(flag) {
    if (!flag || typeof flag !== 'string')
        return '';
    return flag.slice(0, 50);
}
//# sourceMappingURL=createGame.js.map