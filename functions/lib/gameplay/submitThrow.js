"use strict";
/**
 * Submit Throw
 *
 * Server-authoritative dart throw validation.
 * Every dart throw must go through this function.
 *
 * Security:
 * - Verifies it's the caller's turn
 * - Validates dart position bounds
 * - Server calculates score from position (no client trust)
 * - Server controls all game state updates
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
exports.submitThrow = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const scoreCalculator_1 = require("../utils/scoreCalculator");
const db = admin.database();
exports.submitThrow = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    const { gameId, dartPosition } = data;
    // 2. Validate request
    if (!gameId || typeof gameId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid game ID');
    }
    if (!(0, scoreCalculator_1.isValidDartPosition)(dartPosition)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid dart position. Must be {x: 0-500, y: 0-500}');
    }
    // 3. Fetch game state
    const gameRef = db.ref(`games/${gameId}`);
    const gameSnap = await gameRef.once('value');
    const game = gameSnap.val();
    if (!game) {
        throw new functions.https.HttpsError('not-found', 'Game not found');
    }
    // 4. Verify game is still playing
    if (game.status !== 'playing') {
        throw new functions.https.HttpsError('failed-precondition', 'Game is not in playing state');
    }
    // 5. Determine player index
    let playerIndex;
    if (game.player1.id === userId) {
        playerIndex = 0;
    }
    else if (game.player2.id === userId) {
        playerIndex = 1;
    }
    else {
        throw new functions.https.HttpsError('permission-denied', 'You are not a player in this game');
    }
    // 6. Verify it's this player's turn
    if (game.currentPlayer !== playerIndex) {
        throw new functions.https.HttpsError('failed-precondition', 'It is not your turn');
    }
    // 7. Verify darts remaining in turn
    if (game.dartsThrown >= 3) {
        throw new functions.https.HttpsError('failed-precondition', 'No darts remaining in this turn');
    }
    // 8. Calculate score SERVER-SIDE (no client trust)
    const scoreResult = (0, scoreCalculator_1.calculateScoreFromPosition)(dartPosition.x, dartPosition.y);
    const { score, label, multiplier } = scoreResult;
    // 9. Calculate new game state
    const playerKey = playerIndex === 0 ? 'player1' : 'player2';
    const currentScore = game[playerKey].score;
    const turnStartScore = currentScore + game.currentTurnScore; // Score at start of turn
    const newScore = currentScore - score;
    // Check for bust
    const throwIsBust = (0, scoreCalculator_1.isBust)(currentScore, score, multiplier);
    // Check for checkout (game win)
    const throwIsCheckout = (0, scoreCalculator_1.isCheckout)(currentScore, score, multiplier);
    // 10. Build update object
    const updates = {};
    const throwId = db.ref().push().key;
    const now = Date.now();
    // Record the throw
    updates[`throwHistory/${throwId}`] = {
        score,
        label,
        player: playerIndex,
        multiplier,
        dartPosition,
        timestamp: now,
        resultingScore: throwIsBust ? currentScore : newScore,
    };
    // Record dart position for display
    updates[`dartPositions/${game.dartsThrown}`] = dartPosition;
    // Update darts thrown
    const newDartsThrown = game.dartsThrown + 1;
    updates['dartsThrown'] = newDartsThrown;
    // Determine turn/game state
    let turnEnded = false;
    let gameEnded = false;
    let winner;
    if (throwIsCheckout) {
        // GAME WON - valid checkout with double
        updates[`${playerKey}/score`] = 0;
        updates['currentTurnScore'] = game.currentTurnScore + score;
        updates['status'] = 'finished';
        updates['winner'] = playerIndex;
        updates['completedAt'] = now;
        gameEnded = true;
        turnEnded = true;
        winner = playerIndex;
        console.log(`[submitThrow] Game ${gameId}: Player ${playerIndex} wins with ${label}!`);
    }
    else if (throwIsBust) {
        // BUST - score resets to turn start, turn ends
        updates[`${playerKey}/score`] = turnStartScore; // Reset to start of turn
        updates['currentTurnScore'] = 0;
        updates['dartsThrown'] = 0;
        updates['currentPlayer'] = playerIndex === 0 ? 1 : 0;
        updates['dartPositions'] = {}; // Clear dart positions for next turn
        turnEnded = true;
        console.log(`[submitThrow] Game ${gameId}: Player ${playerIndex} busts with ${label}`);
    }
    else {
        // Valid throw - update score
        updates[`${playerKey}/score`] = newScore;
        updates['currentTurnScore'] = game.currentTurnScore + score;
        // Check if turn ends (3 darts thrown)
        if (newDartsThrown >= 3) {
            updates['currentTurnScore'] = 0;
            updates['dartsThrown'] = 0;
            updates['currentPlayer'] = playerIndex === 0 ? 1 : 0;
            updates['dartPositions'] = {}; // Clear for next turn
            turnEnded = true;
            console.log(`[submitThrow] Game ${gameId}: Player ${playerIndex} turn ends`);
        }
    }
    // 11. Apply updates atomically
    await gameRef.update(updates);
    // 12. Return result
    return {
        success: true,
        score,
        label,
        multiplier,
        isBust: throwIsBust,
        isCheckout: throwIsCheckout,
        newScore: throwIsBust ? turnStartScore : (throwIsCheckout ? 0 : newScore),
        dartsThrown: turnEnded ? 0 : newDartsThrown,
        turnEnded,
        gameEnded,
        winner,
    };
});
//# sourceMappingURL=submitThrow.js.map