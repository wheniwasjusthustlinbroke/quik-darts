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

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '../utils/rateLimit';
import { CREATE_GAME_LOCK_TIMEOUT_MS } from '../wagering/settlementConstants';

const db = admin.database();

interface CreateGameRequest {
  player1Id: string;
  player1Name: string;
  player1Flag: string;
  player2Id: string;
  player2Name: string;
  player2Flag: string;
  gameMode: 301 | 501;
  isWagered: boolean;
  stakeAmount?: number;
  escrowId?: string;
}

interface CreateGameResult {
  success: boolean;
  gameId?: string;
  error?: string;
}

export const createGame = functions
  .region('europe-west1')
  .https.onCall(async (data: CreateGameRequest, context): Promise<CreateGameResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in'
      );
    }

    const userId = context.auth.uid;

    // 1.5. Rate limiting
    await checkRateLimit(userId, 'createGame', RATE_LIMITS.createGame.limit, RATE_LIMITS.createGame.windowMs);

    // 2. Validate request
    const {
      player1Id,
      player1Name,
      player1Flag,
      player2Id,
      player2Name,
      player2Flag,
      gameMode,
      isWagered,
      stakeAmount,
      escrowId,
    } = data;

    // Caller must be one of the players
    if (userId !== player1Id && userId !== player2Id) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You must be a player in this game'
      );
    }

    // Validate game mode
    if (gameMode !== 301 && gameMode !== 501) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid game mode. Must be 301 or 501.'
      );
    }

    // Validate player IDs are valid strings
    if (!player1Id || typeof player1Id !== 'string' || player1Id.length > 128) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid player1 ID'
      );
    }
    if (!player2Id || typeof player2Id !== 'string' || player2Id.length > 128) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid player2 ID'
      );
    }
    if (player1Id === player2Id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Cannot play against yourself'
      );
    }

    // 3. For wagered games, verify escrow
    if (isWagered) {
      if (!escrowId || !stakeAmount) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Wagered games require escrowId and stakeAmount'
        );
      }

      const escrowSnap = await db.ref(`escrow/${escrowId}`).once('value');
      const escrow = escrowSnap.val();

      if (!escrow) {
        throw new functions.https.HttpsError(
          'not-found',
          'Escrow not found'
        );
      }

      if (escrow.status !== 'locked') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Escrow must be locked before creating game'
        );
      }

      // Verify escrow matches players
      const escrowPlayers = [escrow.player1?.userId, escrow.player2?.userId];
      if (!escrowPlayers.includes(player1Id) || !escrowPlayers.includes(player2Id)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Escrow players do not match game players'
        );
      }
    }

    // Database URL for diagnostics (used in both casual and wagered flows)
    const dbUrl = (db.app.options as any).databaseURL ?? 'UNDEFINED';

    // 3b. For casual games, atomically claim opponent (transaction prevents race)
    let casualGameId: string | null = null;
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
      let abortReason: string | null = null;
      const claimResult = await queueEntryRef.transaction((entry) => {
        if (!entry) {
          abortReason = 'missing_entry_probe';
          return null;  // Don't abort; let built-in retry fetch real value if it exists
        }
        if (entry.matchedGameId) {
          abortReason = 'already_matched';
          return;  // abort
        }
        if (entry.gameMode && entry.gameMode !== gameMode) {
          abortReason = 'mode_mismatch';
          return;  // abort
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
    let wageredGameId: string | null = null;
    let wageredStakeLevel: string | null = null;
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
      let abortReason: string | null = null;
      const claimResult = await queueEntryRef.transaction((entry) => {
        if (!entry) {
          abortReason = 'missing_entry_probe';
          return null;  // Don't abort; let built-in retry fetch real value if it exists
        }
        if (entry.matchedGameId) {
          abortReason = 'already_matched';
          return;  // abort
        }
        if (entry.gameMode && entry.gameMode !== gameMode) {
          abortReason = 'mode_mismatch';
          return;  // abort
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
    const gameId = (preGeneratedId ?? fallbackId)!;
    const gameRef = db.ref(`games/${gameId}`);
    const now = Date.now();
    const requestId = `createGame_${randomUUID()}`;
    let escrowLockAcquired = false;
    let shouldRollbackQueue = true;
    let phase2Committed = false;

    try {
      // Phase 1: For wagered games, acquire escrow lock AND reserve gameId (CAS)
      if (isWagered && escrowId) {
        const escrowRef = db.ref(`escrow/${escrowId}`);

        const lockResult = await escrowRef.transaction((escrow) => {
          if (!escrow) return;
          if (escrow.status !== 'locked') return;
          if (escrow.gameId && escrow.gameId !== gameId) return; // Different game linked
          // Block if already completed (prevents game overwrite)
          if (escrow.createGameStatus === 'completed' || escrow.gameCreatedAt) return;
          if (escrow.createGameStatus === 'processing') {
            const age = now - (escrow.createGameStartedAt || 0);
            if (age < CREATE_GAME_LOCK_TIMEOUT_MS) return;
          }
          return {
            ...escrow,
            gameId: escrow.gameId ?? gameId, // Reserve gameId if not set
            createGameStatus: 'processing',
            createGameRequestId: requestId,
            createGameStartedAt: now,
            createGameError: null,
          };
        });

        const after = lockResult.snapshot.val();
        if (!lockResult.committed || after?.createGameRequestId !== requestId) {
          // Discriminate error cases
          if (!after) {
            throw new functions.https.HttpsError('not-found', 'Escrow not found');
          }
          if (after.status !== 'locked') {
            throw new functions.https.HttpsError('failed-precondition', 'Escrow not in locked status');
          }
          if (after.gameId && after.gameId !== gameId) {
            throw new functions.https.HttpsError('failed-precondition', 'Escrow linked to different game');
          }
          // Already completed - check if game exists (idempotent)
          if (after.createGameStatus === 'completed' || after.gameCreatedAt) {
            if (after.gameId === gameId && (await gameRef.once('value')).exists()) {
              return { success: true, gameId };
            }
            throw new functions.https.HttpsError('failed-precondition', 'Escrow marked created but game missing');
          }
          if (after.gameId === gameId && (await gameRef.once('value')).exists()) {
            return { success: true, gameId }; // Idempotent success
          }
          if (after.createGameStatus === 'processing') {
            shouldRollbackQueue = false; // Don't sabotage legitimate creator
          }
          throw new functions.https.HttpsError('aborted', 'Game creation in progress. Please retry.');
        }
        escrowLockAcquired = true;
      }

      // Pre-read: Don't overwrite existing game (belt-and-suspenders)
      const existingGameSnap = await gameRef.once('value');
      if (existingGameSnap.exists()) {
        // Game exists - finalize and return (with commit-check)
        if (escrowLockAcquired && escrowId) {
          const earlyFinalizeResult = await db.ref(`escrow/${escrowId}`).transaction((escrow) => {
            if (!escrow || escrow.createGameRequestId !== requestId) return;
            return {
              ...escrow,
              createGameStatus: 'completed',
              createGameRequestId: null,
              createGameStartedAt: null,
              createGameError: null,
              createGameErrorAt: null,
            };
          });

          if (!earlyFinalizeResult.committed) {
            const latest = (await db.ref(`escrow/${escrowId}`).once('value')).val();
            if (latest?.createGameStatus !== 'completed') {
              throw new functions.https.HttpsError('aborted', 'Finalization incomplete. Please retry.');
            }
          }
        }
        return { success: true, gameId };
      }

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

      // Phase 2: Atomic multi-location update (gameId already reserved in Phase 1)
      const updates: Record<string, unknown> = { [`games/${gameId}`]: gameData };
      if (isWagered && escrowId) {
        updates[`escrow/${escrowId}/gameCreatedAt`] = now;
      }
      await db.ref().update(updates);
      phase2Committed = true;

      // Phase 3: Owner-guarded finalize (commit-checked)
      if (escrowLockAcquired && escrowId) {
        const finalizeResult = await db.ref(`escrow/${escrowId}`).transaction((escrow) => {
          if (!escrow || escrow.createGameRequestId !== requestId) return;
          return {
            ...escrow,
            createGameStatus: 'completed',
            createGameRequestId: null,
            createGameStartedAt: null,
            createGameError: null,
            createGameErrorAt: null,
          };
        });

        if (!finalizeResult.committed) {
          const latest = (await db.ref(`escrow/${escrowId}`).once('value')).val();
          if (latest?.createGameStatus !== 'completed') {
            throw new functions.https.HttpsError('aborted', 'Finalization incomplete. Please retry.');
          }
        }
      }

    } catch (error) {
      // Owner-guarded escrow rollback (conditionally clear gameId if Phase 2 didn't commit)
      if (escrowLockAcquired && escrowId) {
        await db.ref(`escrow/${escrowId}`).transaction((escrow) => {
          if (!escrow || escrow.createGameRequestId !== requestId) return;
          const shouldClearGameLink = !phase2Committed && escrow.gameId === gameId;
          return {
            ...escrow,
            ...(shouldClearGameLink ? { gameId: null, gameCreatedAt: null } : {}),
            createGameStatus: null,
            createGameRequestId: null,
            createGameStartedAt: null,
            createGameError: `failed_${requestId}`,
            createGameErrorAt: now,
          };
        });
      }

      // Queue rollback - only if shouldRollbackQueue AND !phase2Committed
      if (shouldRollbackQueue && !phase2Committed) {
        if (!isWagered && casualGameId) {
          const rollbackResult = await db.ref(`matchmaking_queue/casual/${player1Id}/matchedGameId`).transaction((current) => {
            if (current === casualGameId) return null; // Intentional deletion
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
            if (current === wageredGameId) return null; // Intentional deletion
            return; // abort - someone else's claim
          });
          if (rollbackResult.committed) {
            await db.ref(`matchmaking_queue/wagered/${wageredStakeLevel}/${player1Id}`).update({
              matchedByName: null,
              matchedByFlag: null,
            });
          }
        }
      }
      throw error;
    }

    console.log(`[createGame] Created game ${gameId} between ${player1Id} and ${player2Id}`);

    return {
      success: true,
      gameId: gameId!,
    };
  });

// Sanitize player name
function sanitizeName(name: string): string {
  if (!name || typeof name !== 'string') return 'Player';
  return name
    .slice(0, 20)
    .replace(/[^a-zA-Z0-9\s\-_.!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Player';
}

// Sanitize flag (allow emojis)
function sanitizeFlag(flag: string): string {
  if (!flag || typeof flag !== 'string') return '';
  return flag.slice(0, 50);
}
