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

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  BOARD_SIZE,
  calculateScoreFromPosition,
  isValidDartPosition,
  isBust,
  isCheckout,
  DartPosition,
} from '../utils/scoreCalculator';
import { applySegmentMiss } from '../throwing/segmentMiss';

const db = admin.database();

// Feature toggle for segment-based miss system (server)
// OFF by default - flip after client-server parity testing (Step 8)
// WARNING: When ON, parity will be WRONG until dynamic perfect-zone width is
// implemented (checkout ultra-narrow zone, shrink-per-perfect-hit not tracked yet)
const USE_SEGMENT_MISS_SERVER = false;

// Rhythm configuration
export const RHYTHM_CONFIG = {
  rushThreshold: 1000,      // < 1s = rushing
  idealMin: 1500,           // 1.5-2.5s = perfect
  idealMax: 2500,
  hesitateThreshold: 4000,  // > 4s = hesitating
  rushPenalty: -0.08,
  hesitatePenalty: -0.04,
  perfectBonus: 0.06,
  consistencyBonus: 0.04,   // Extra if all throws in rhythm
};

// Rate limiting
export const MIN_THROW_INTERVAL = 500; // ms - minimum time between throws

// Validation configuration
// TODO Step 8: Implement dynamic zone width tracking (perfectHitsThisTurn).
// Until then, server uses static 10% zone (45-55). Parity will be WRONG for:
// - Checkout scenarios (client uses ultra-narrow 2% zone)
// - Shrink-per-perfect-hit (client shrinks zone after each perfect release)
export const PERFECT_ZONE = { min: 45, max: 55 };

type RhythmState = 'flow' | 'perfect' | 'neutral' | 'rushing' | 'hesitating';

interface RhythmResult {
  bonus: number;
  state: RhythmState;
}

interface TurnThrow {
  timestamp: number;
  position: DartPosition;
}

interface SubmitThrowRequest {
  gameId: string;
  dartPosition: DartPosition;
  // Optional enhanced payload for wagered matches
  aimPoint?: { x: number; y: number };
  powerValue?: number;
  throwId?: string;
}

interface SubmitThrowResult {
  success: boolean;
  score: number;
  label: string;
  multiplier: number;
  isBust: boolean;
  isCheckout: boolean;
  newScore: number;
  dartsThrown: number;
  turnEnded: boolean;
  gameEnded: boolean;
  winner?: number;
  error?: string;
  // New fields for rhythm and validation
  rhythm?: RhythmState;
  serverTimestamp?: number;
  positionAdjusted?: boolean;
  adjustedPosition?: DartPosition;
}

/**
 * Calculate server-side rhythm bonus based on throw timestamps.
 * Rhythm is determined by the interval between consecutive throws.
 */
function calculateServerRhythm(
  currentTurnThrows: TurnThrow[],
  currentTimestamp: number
): RhythmResult {
  // First throw of turn - neutral rhythm
  if (!currentTurnThrows || currentTurnThrows.length < 1) {
    return { bonus: 0, state: 'neutral' };
  }

  const lastThrowTime = currentTurnThrows[currentTurnThrows.length - 1].timestamp;
  const interval = currentTimestamp - lastThrowTime;

  let bonus = 0;
  let state: RhythmState = 'neutral';

  if (interval < RHYTHM_CONFIG.rushThreshold) {
    bonus = RHYTHM_CONFIG.rushPenalty;
    state = 'rushing';
  } else if (interval > RHYTHM_CONFIG.hesitateThreshold) {
    bonus = RHYTHM_CONFIG.hesitatePenalty;
    state = 'hesitating';
  } else if (interval >= RHYTHM_CONFIG.idealMin && interval <= RHYTHM_CONFIG.idealMax) {
    bonus = RHYTHM_CONFIG.perfectBonus;
    state = 'perfect';

    // Check consistency across turn for flow state
    if (currentTurnThrows.length >= 2) {
      const allInRhythm = currentTurnThrows.every((t, i) => {
        if (i === 0) return true;
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
function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Create a seeded pseudo-random number generator.
 * Uses mulberry32 algorithm for deterministic results.
 */
function createSeededRng(seed: number): () => number {
  let state = seed;
  return function (): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate deterministic seed for a throw.
 * Uses stable inputs only - NO timestamp (breaks idempotency).
 * Includes playerIndex to ensure different seeds for each player's throws.
 */
function generateServerThrowSeed(
  gameId: string,
  playerIndex: number,
  playerThrowCount: number
): number {
  let hash = 0;
  for (let i = 0; i < gameId.length; i++) {
    const char = gameId.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Combine with player + throw count for uniqueness per player per throw
  // playerIndex * 10000 ensures different seeds for player 0 vs player 1
  return (hash ^ (playerIndex * 10000 + playerThrowCount)) | 0;
}

/**
 * Validate that enhanced payload has valid types.
 * SECURITY: Prevents type confusion attacks.
 */
function isValidEnhancedPayload(
  aimPoint: unknown,
  powerValue: unknown
): aimPoint is { x: number; y: number } {
  if (!aimPoint || typeof aimPoint !== 'object') return false;
  const ap = aimPoint as Record<string, unknown>;
  if (typeof ap.x !== 'number' || typeof ap.y !== 'number') return false;
  if (!Number.isFinite(ap.x) || !Number.isFinite(ap.y)) return false;
  if (typeof powerValue !== 'number' || !Number.isFinite(powerValue)) return false;
  return true;
}

/**
 * Validate throw plausibility for anti-cheat.
 * SECURITY: For wagered matches, enhanced payload is REQUIRED.
 */
function validateThrowPlausibility(
  aimPoint: { x: number; y: number } | undefined,
  powerValue: number | undefined,
  finalPosition: DartPosition,
  rhythm: RhythmResult,
  isWageredMatch: boolean
): { valid: boolean; reason?: string } {
  // SECURITY: For wagered matches, enhanced payload is REQUIRED
  // This prevents attackers from bypassing validation by not sending the payload
  if (isWageredMatch) {
    if (!aimPoint || powerValue === undefined) {
      return { valid: false, reason: 'missing_required_payload_for_wagered_match' };
    }
  } else {
    // Casual mode: skip plausibility check if no enhanced payload
    if (!aimPoint || powerValue === undefined) {
      return { valid: true };
    }
  }

  // Validate aim point is within board bounds
  if (aimPoint.x < 0 || aimPoint.x > BOARD_SIZE || aimPoint.y < 0 || aimPoint.y > BOARD_SIZE) {
    return { valid: false, reason: 'aim_point_out_of_bounds' };
  }

  // Validate power value range
  if (powerValue < 0 || powerValue > 100) {
    return { valid: false, reason: 'power_value_out_of_range' };
  }

  // Determine if power was in perfect zone
  const wasActuallyPerfect = powerValue >= PERFECT_ZONE.min && powerValue <= PERFECT_ZONE.max;

  // Calculate max allowed deviation based on power
  let baseDeviation: number;
  if (wasActuallyPerfect) {
    baseDeviation = 5; // Very tight, 5px max for perfect zone
  } else {
    const distanceFromPerfect = Math.min(
      Math.abs(powerValue - PERFECT_ZONE.min),
      Math.abs(powerValue - PERFECT_ZONE.max)
    );
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

export const submitThrow = functions
  .region('europe-west1')
  .https.onCall(async (data: SubmitThrowRequest, context): Promise<SubmitThrowResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in'
      );
    }

    const userId = context.auth.uid;
    const { gameId, dartPosition, aimPoint, powerValue, throwId } = data;
    const now = Date.now();

    // 2. Validate request
    if (!gameId || typeof gameId !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid game ID'
      );
    }

    if (!isValidDartPosition(dartPosition)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid dart position. Must be {x: 0-${BOARD_SIZE}, y: 0-${BOARD_SIZE}}`
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
        'Game is not in playing state'
      );
    }

    // 5. Determine player index
    let playerIndex: number;
    if (game.player1.id === userId) {
      playerIndex = 0;
    } else if (game.player2.id === userId) {
      playerIndex = 1;
    } else {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a player in this game'
      );
    }

    // 6. Verify it's this player's turn
    if (game.currentPlayer !== playerIndex) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'It is not your turn'
      );
    }

    // 7. Verify darts remaining in turn
    if (game.dartsThrown >= 3) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No darts remaining in this turn'
      );
    }

    // 7.5. Rate limiting - prevent throw spam
    const currentTurnThrows: TurnThrow[] = game.currentTurnThrows || [];
    if (currentTurnThrows.length > 0) {
      const lastThrowTime = currentTurnThrows[currentTurnThrows.length - 1].timestamp;
      if (now - lastThrowTime < MIN_THROW_INTERVAL) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Throwing too fast'
        );
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
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Escrow not found for wagered match. Game is invalid.'
        );
      }

      if (escrow.status !== 'locked') {
        console.error(`[submitThrow] Escrow not locked (${escrow.status}) - game ${gameId}`);
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Escrow not locked. Cannot continue wagered match.'
        );
      }

      isWagered = true;
      console.log(`[submitThrow] Escrow verified for wagered match - game ${gameId}`);
    }

    // SECURITY: For wagered matches, validate enhanced payload types first
    if (isWagered && (aimPoint !== undefined || powerValue !== undefined)) {
      if (!isValidEnhancedPayload(aimPoint, powerValue)) {
        console.warn(`[submitThrow] Anti-cheat: Invalid payload types in game ${gameId}`);
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid throw payload: malformed aimPoint or powerValue'
        );
      }
    }

    // 8.6. Compute effective dart position (server-authoritative scatter)
    // When USE_SEGMENT_MISS_SERVER is ON: server computes position, skips legacy plausibility
    // When OFF: use client dartPosition with legacy plausibility validation
    const useServerScatter =
      USE_SEGMENT_MISS_SERVER && isWagered && aimPoint && powerValue !== undefined;

    let effectiveDartPosition: DartPosition = dartPosition;
    let wasPerfectHit = false; // Track for dynamic zone shrinking (Step 8.3)

    if (useServerScatter) {
      // Validate inputs (belt-and-suspenders with isValidEnhancedPayload)
      if (
        typeof powerValue !== 'number' || !Number.isFinite(powerValue) ||
        typeof aimPoint.x !== 'number' || !Number.isFinite(aimPoint.x) ||
        typeof aimPoint.y !== 'number' || !Number.isFinite(aimPoint.y)
      ) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid aim/power');
      }
      if (powerValue < 0 || powerValue > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid powerValue: must be 0-100');
      }
      // Validate aimPoint is within board bounds
      if (aimPoint.x < 0 || aimPoint.x > BOARD_SIZE || aimPoint.y < 0 || aimPoint.y > BOARD_SIZE) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid aimPoint: out of bounds');
      }

      // O(1) per-player throw count from game state (replaces throwHistory scan)
      const playerTotalDarts = (game.playerTotalDarts ?? [0, 0]) as [number, number];
      const playerThrowCount = playerTotalDarts[playerIndex] ?? 0;

      const seed = generateServerThrowSeed(gameId, playerIndex, playerThrowCount);
      const rng = createSeededRng(seed);

      // Compute server-authoritative landing position
      const missResult = applySegmentMiss(
        aimPoint.x,
        aimPoint.y,
        powerValue,
        PERFECT_ZONE.min,
        PERFECT_ZONE.max,
        rng
      );

      // Validate output: finite + within board bounds (allows MISS zone outside scoring circle)
      if (
        !Number.isFinite(missResult.x) || !Number.isFinite(missResult.y) ||
        missResult.x < 0 || missResult.x > BOARD_SIZE ||
        missResult.y < 0 || missResult.y > BOARD_SIZE
      ) {
        console.error(`[submitThrow] Server-scatter produced invalid position in game ${gameId}`);
        throw new functions.https.HttpsError('failed-precondition', 'Invalid computed throw');
      }

      effectiveDartPosition = { x: missResult.x, y: missResult.y };

      // Track if power was in perfect zone (strict bounds to match client semantics)
      wasPerfectHit = powerValue > PERFECT_ZONE.min && powerValue < PERFECT_ZONE.max;

      // NOTE: Skip legacy deviation-based plausibility when server computes position.
      // The server computed it - checking deviation against aimPoint is circular.
    } else {
      // Legacy flow: validate client dartPosition plausibility
      const plausibility = validateThrowPlausibility(
        aimPoint as { x: number; y: number } | undefined,
        powerValue,
        dartPosition,
        rhythm,
        isWagered
      );
      if (!plausibility.valid) {
        console.warn(`[submitThrow] Anti-cheat: Rejected throw in game ${gameId} - ${plausibility.reason}`);
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Invalid throw: ${plausibility.reason}`
        );
      }
    }

    // 9. Calculate score SERVER-SIDE (from effective position)
    const scoreResult = calculateScoreFromPosition(effectiveDartPosition.x, effectiveDartPosition.y);
    const { score, label, multiplier } = scoreResult;

    // 9.5. Calculate new game state
    const playerKey = playerIndex === 0 ? 'player1' : 'player2';
    const currentScore = game[playerKey].score;
    const turnStartScore = currentScore + game.currentTurnScore; // Score at start of turn
    const newScore = currentScore - score;

    // Check for bust
    const throwIsBust = isBust(currentScore, score, multiplier);

    // Check for checkout (game win)
    const throwIsCheckout = isCheckout(currentScore, score, multiplier);

    // 10. Build update object
    const updates: Record<string, unknown> = {};
    const generatedThrowId = throwId || db.ref().push().key;

    // Record the throw in history
    updates[`throwHistory/${generatedThrowId}`] = {
      score,
      label,
      player: playerIndex,
      multiplier,
      dartPosition: effectiveDartPosition,
      timestamp: now,
      resultingScore: throwIsBust ? currentScore : newScore,
      rhythm: rhythm.state,
    };

    // Record dart position for display
    updates[`dartPositions/${game.dartsThrown}`] = effectiveDartPosition;

    // Update darts thrown
    const newDartsThrown = game.dartsThrown + 1;
    updates['dartsThrown'] = newDartsThrown;

    // Increment per-player throw counter (O(1) for RNG seed)
    const playerTotalDarts = (game.playerTotalDarts ?? [0, 0]) as [number, number];
    const newPlayerTotalDarts = [...playerTotalDarts] as [number, number];
    newPlayerTotalDarts[playerIndex] = (newPlayerTotalDarts[playerIndex] ?? 0) + 1;
    updates['playerTotalDarts'] = newPlayerTotalDarts;

    // Track perfect hits this turn for dynamic zone shrinking (only when server scatter is ON)
    const perfectHitsThisTurn = (game.perfectHitsThisTurn ?? [0, 0]) as [number, number];
    const newPerfectHits = [...perfectHitsThisTurn] as [number, number];
    if (useServerScatter && wasPerfectHit) {
      newPerfectHits[playerIndex] = (newPerfectHits[playerIndex] ?? 0) + 1;
    }
    updates['perfectHitsThisTurn'] = newPerfectHits;
    // Note: reset to [0, 0] happens below on turn end (bust/3-dart/checkout)

    // Update current turn throws for rhythm tracking
    const newTurnThrow: TurnThrow = { timestamp: now, position: effectiveDartPosition };
    const updatedTurnThrows = [...currentTurnThrows, newTurnThrow];

    // Determine turn/game state
    let turnEnded = false;
    let gameEnded = false;
    let winner: number | undefined;

    if (throwIsCheckout) {
      // GAME WON - valid checkout with double
      updates[`${playerKey}/score`] = 0;
      updates['currentTurnScore'] = game.currentTurnScore + score;
      updates['status'] = 'finished';
      updates['winner'] = playerIndex;
      updates['completedAt'] = now;
      updates['currentTurnThrows'] = null; // Clear turn throws
      updates['perfectHitsThisTurn'] = [0, 0]; // Reset for game end
      gameEnded = true;
      turnEnded = true;
      winner = playerIndex;

      console.log(`[submitThrow] Game ${gameId}: Player ${playerIndex} wins with ${label}!`);
    } else if (throwIsBust) {
      // BUST - score resets to turn start, turn ends
      updates[`${playerKey}/score`] = turnStartScore; // Reset to start of turn
      updates['currentTurnScore'] = 0;
      updates['dartsThrown'] = 0;
      updates['currentPlayer'] = playerIndex === 0 ? 1 : 0;
      updates['currentTurnThrows'] = null; // Clear turn throws for next player
      updates['perfectHitsThisTurn'] = [0, 0]; // Reset for next player's turn
      // Clear dart positions using null (avoids Firebase update conflict with dartPositions/N)
      updates['dartPositions/0'] = null;
      updates['dartPositions/1'] = null;
      updates['dartPositions/2'] = null;
      turnEnded = true;

      console.log(`[submitThrow] Game ${gameId}: Player ${playerIndex} busts with ${label}`);
    } else {
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
        updates['perfectHitsThisTurn'] = [0, 0]; // Reset for next player's turn
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
