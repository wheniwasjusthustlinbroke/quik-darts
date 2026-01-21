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
 * - Server validates throw plausibility (anti-cheat)
 * - Server calculates rhythm bonus from timestamps
 * - Rate limiting to prevent throw spam
 * - Wagered matches: escrow existence and lock status verified (not just game state)
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
// Rhythm configuration
const RHYTHM_CONFIG = {
    rushThreshold: 1000, // < 1s = rushing
    idealMin: 1500, // 1.5-2.5s = perfect
    idealMax: 2500,
    hesitateThreshold: 4000, // > 4s = hesitating
    rushPenalty: -0.08,
    hesitatePenalty: -0.04,
    perfectBonus: 0.06,
    consistencyBonus: 0.04, // Extra if all throws in rhythm
};
// Rate limiting
const MIN_THROW_INTERVAL = 500; // ms - minimum time between throws
// Validation configuration
const PERFECT_ZONE = { min: 45, max: 55 };
/**
 * Calculate server-side rhythm bonus based on throw timestamps.
 * Rhythm is determined by the interval between consecutive throws.
 */
function calculateServerRhythm(currentTurnThrows, currentTimestamp) {
    // First throw of turn - neutral rhythm
    if (!currentTurnThrows || currentTurnThrows.length < 1) {
        return { bonus: 0, state: 'neutral' };
    }
    const lastThrowTime = currentTurnThrows[currentTurnThrows.length - 1].timestamp;
    const interval = currentTimestamp - lastThrowTime;
    let bonus = 0;
    let state = 'neutral';
    if (interval < RHYTHM_CONFIG.rushThreshold) {
        bonus = RHYTHM_CONFIG.rushPenalty;
        state = 'rushing';
    }
    else if (interval > RHYTHM_CONFIG.hesitateThreshold) {
        bonus = RHYTHM_CONFIG.hesitatePenalty;
        state = 'hesitating';
    }
    else if (interval >= RHYTHM_CONFIG.idealMin && interval <= RHYTHM_CONFIG.idealMax) {
        bonus = RHYTHM_CONFIG.perfectBonus;
        state = 'perfect';
        // Check consistency across turn for flow state
        if (currentTurnThrows.length >= 2) {
            const allInRhythm = currentTurnThrows.every((t, i) => {
                if (i === 0)
                    return true;
                const int = t.timestamp - currentTurnThrows[i - 1].timestamp;
                return int >= RHYTHM_CONFIG.idealMin && int <= RHYTHM_CONFIG.idealMax;
            });
            if (allInRhythm) {
                bonus += RHYTHM_CONFIG.consistencyBonus;
                state = 'flow';
            }
        }
    }
    return { bonus, state };
}
/**
 * Calculate distance between two points.
 */
function getDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}
/**
 * Validate that enhanced payload has valid types.
 * SECURITY: Prevents type confusion attacks.
 */
function isValidEnhancedPayload(aimPoint, powerValue) {
    if (!aimPoint || typeof aimPoint !== 'object')
        return false;
    const ap = aimPoint;
    if (typeof ap.x !== 'number' || typeof ap.y !== 'number')
        return false;
    if (!Number.isFinite(ap.x) || !Number.isFinite(ap.y))
        return false;
    if (typeof powerValue !== 'number' || !Number.isFinite(powerValue))
        return false;
    return true;
}
/**
 * Validate throw plausibility for anti-cheat.
 * SECURITY: For wagered matches, enhanced payload is REQUIRED.
 */
function validateThrowPlausibility(aimPoint, powerValue, finalPosition, rhythm, isWageredMatch) {
    // SECURITY: For wagered matches, enhanced payload is REQUIRED
    // This prevents attackers from bypassing validation by not sending the payload
    if (isWageredMatch) {
        if (!aimPoint || powerValue === undefined) {
            return { valid: false, reason: 'missing_required_payload_for_wagered_match' };
        }
    }
    else {
        // Casual mode: skip plausibility check if no enhanced payload
        if (!aimPoint || powerValue === undefined) {
            return { valid: true };
        }
    }
    // Validate aim point is within board bounds
    if (aimPoint.x < 0 || aimPoint.x > 500 || aimPoint.y < 0 || aimPoint.y > 500) {
        return { valid: false, reason: 'aim_point_out_of_bounds' };
    }
    // Validate power value range
    if (powerValue < 0 || powerValue > 100) {
        return { valid: false, reason: 'power_value_out_of_range' };
    }
    // Determine if power was in perfect zone
    const wasActuallyPerfect = powerValue >= PERFECT_ZONE.min && powerValue <= PERFECT_ZONE.max;
    // Calculate max allowed deviation based on power
    let baseDeviation;
    if (wasActuallyPerfect) {
        baseDeviation = 5; // Very tight, 5px max for perfect zone
    }
    else {
        const distanceFromPerfect = Math.min(Math.abs(powerValue - PERFECT_ZONE.min), Math.abs(powerValue - PERFECT_ZONE.max));
        baseDeviation = 10 + (distanceFromPerfect * 2); // 10-100px
    }
    // Apply rhythm modifier (worse rhythm = more expected deviation)
    // SECURITY: Clamp modifier to prevent exploitation (0.9 to 1.1 range)
    const rhythmModifier = Math.max(0.9, Math.min(1.1, 1 - rhythm.bonus));
    const maxDeviation = baseDeviation * rhythmModifier;
    // Check if claimed position is plausible
    const actualDeviation = getDistance(aimPoint, finalPosition);
    // Position too far from aim (worse than expected for this power)
    if (actualDeviation > maxDeviation * 1.5) {
        return { valid: false, reason: 'position_too_far' };
    }
    // Perfect accuracy without perfect zone is suspicious
    if (actualDeviation < 2 && !wasActuallyPerfect) {
        return { valid: false, reason: 'impossible_accuracy_without_perfect_zone' };
    }
    // Perfect zone but huge deviation is suspicious (intentional bad throw?)
    if (wasActuallyPerfect && actualDeviation > baseDeviation * 4) {
        return { valid: false, reason: 'suspicious_miss' };
    }
    return { valid: true };
}
exports.submitThrow = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    const { gameId, dartPosition, aimPoint, powerValue, throwId } = data;
    const now = Date.now();
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
    // 7.5. Rate limiting - prevent throw spam
    const currentTurnThrows = game.currentTurnThrows || [];
    if (currentTurnThrows.length > 0) {
        const lastThrowTime = currentTurnThrows[currentTurnThrows.length - 1].timestamp;
        if (now - lastThrowTime < MIN_THROW_INTERVAL) {
            throw new functions.https.HttpsError('failed-precondition', 'Throwing too fast');
        }
    }
    // 8. Calculate server-side rhythm
    const rhythm = calculateServerRhythm(currentTurnThrows, now);
    // 8.5. Validate throw plausibility (anti-cheat)
    // SECURITY: Don't just trust game.wagerAmount - verify the escrow is actually locked
    let isWagered = false;
    if (game.wagerAmount && game.wagerAmount > 0 && game.wager?.escrowId) {
        // Verify escrow exists and is locked - prevents wagered match fraud
        const escrowRef = db.ref(`escrow/${game.wager.escrowId}`);
        const escrowSnap = await escrowRef.once('value');
        const escrow = escrowSnap.val();
        if (!escrow) {
            console.error(`[submitThrow] Wagered match has no escrow - game ${gameId}`);
            throw new functions.https.HttpsError('failed-precondition', 'Escrow not found for wagered match. Game is invalid.');
        }
        if (escrow.status !== 'locked') {
            console.error(`[submitThrow] Escrow not locked (${escrow.status}) - game ${gameId}`);
            throw new functions.https.HttpsError('failed-precondition', 'Escrow not locked. Cannot continue wagered match.');
        }
        isWagered = true;
        console.log(`[submitThrow] Escrow verified for wagered match - game ${gameId}`);
    }
    // SECURITY: For wagered matches, validate enhanced payload types first
    if (isWagered && (aimPoint !== undefined || powerValue !== undefined)) {
        if (!isValidEnhancedPayload(aimPoint, powerValue)) {
            console.warn(`[submitThrow] Anti-cheat: Invalid payload types in game ${gameId}`);
            throw new functions.https.HttpsError('invalid-argument', 'Invalid throw payload: malformed aimPoint or powerValue');
        }
    }
    // Validate throw plausibility (REQUIRED for wagered, optional for casual)
    const plausibility = validateThrowPlausibility(aimPoint, powerValue, dartPosition, rhythm, isWagered);
    if (!plausibility.valid) {
        console.warn(`[submitThrow] Anti-cheat: Rejected throw in game ${gameId} - ${plausibility.reason}`);
        throw new functions.https.HttpsError('failed-precondition', `Invalid throw: ${plausibility.reason}`);
    }
    // 9. Calculate score SERVER-SIDE (no client trust)
    const scoreResult = (0, scoreCalculator_1.calculateScoreFromPosition)(dartPosition.x, dartPosition.y);
    const { score, label, multiplier } = scoreResult;
    // 9.5. Calculate new game state
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
    const generatedThrowId = throwId || db.ref().push().key;
    // Record the throw in history
    updates[`throwHistory/${generatedThrowId}`] = {
        score,
        label,
        player: playerIndex,
        multiplier,
        dartPosition,
        timestamp: now,
        resultingScore: throwIsBust ? currentScore : newScore,
        rhythm: rhythm.state,
    };
    // Record dart position for display
    updates[`dartPositions/${game.dartsThrown}`] = dartPosition;
    // Update darts thrown
    const newDartsThrown = game.dartsThrown + 1;
    updates['dartsThrown'] = newDartsThrown;
    // Update current turn throws for rhythm tracking
    const newTurnThrow = { timestamp: now, position: dartPosition };
    const updatedTurnThrows = [...currentTurnThrows, newTurnThrow];
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
        updates['currentTurnThrows'] = null; // Clear turn throws
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
        updates['currentTurnThrows'] = null; // Clear turn throws for next player
        // Clear dart positions using null (avoids Firebase update conflict with dartPositions/N)
        updates['dartPositions/0'] = null;
        updates['dartPositions/1'] = null;
        updates['dartPositions/2'] = null;
        turnEnded = true;
        console.log(`[submitThrow] Game ${gameId}: Player ${playerIndex} busts with ${label}`);
    }
    else {
        // Valid throw - update score
        updates[`${playerKey}/score`] = newScore;
        updates['currentTurnScore'] = game.currentTurnScore + score;
        updates['currentTurnThrows'] = updatedTurnThrows; // Store for rhythm calculation
        // Check if turn ends (3 darts thrown)
        if (newDartsThrown >= 3) {
            updates['currentTurnScore'] = 0;
            updates['dartsThrown'] = 0;
            updates['currentPlayer'] = playerIndex === 0 ? 1 : 0;
            updates['currentTurnThrows'] = null; // Clear turn throws for next player
            // Clear dart positions using null (avoids Firebase update conflict with dartPositions/N)
            updates['dartPositions/0'] = null;
            updates['dartPositions/1'] = null;
            updates['dartPositions/2'] = null;
            turnEnded = true;
            console.log(`[submitThrow] Game ${gameId}: Player ${playerIndex} turn ends`);
        }
    }
    // 11. Apply updates atomically
    await gameRef.update(updates);
    // 12. Return result with rhythm state
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
        rhythm: rhythm.state,
        serverTimestamp: now,
    };
});
//# sourceMappingURL=submitThrow.js.map