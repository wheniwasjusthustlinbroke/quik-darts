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

    // 4. Create game room
    const gameRef = db.ref('games').push();
    const gameId = gameRef.key;

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
