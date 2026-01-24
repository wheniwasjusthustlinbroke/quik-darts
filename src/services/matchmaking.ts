/**
 * Matchmaking Service
 *
 * Handles 1v1 casual matchmaking via Firebase Realtime Database.
 * Matches index.html lines 2307-3105 for parity.
 */

import {
  ref,
  set,
  get,
  remove,
  update,
  child,
  onValue,
  query,
  orderByChild,
  limitToFirst,
  onDisconnect,
  serverTimestamp,
  DatabaseReference,
} from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDatabase, getFirebaseFunctions, authReadyPromise } from './firebase';
import { FIREBASE_PATHS } from '../utils/firebase';

// Types
export interface QueueEntry {
  playerId: string;
  name: string;
  flag: string;
  level: number;
  avatarUrl: string | null;
  timestamp: object; // serverTimestamp()
  matchedGameId?: string;
  matchedByName?: string;
  matchedByFlag?: string;
}

export interface MatchFoundData {
  roomId: string;
  playerIndex: 0 | 1;
  opponent: {
    name: string;
    flag: string;
    level: number;
    avatarUrl: string | null;
  };
}

export interface MatchmakingCallbacks {
  onSearching?: () => void;
  onFound?: (data: MatchFoundData) => void;
  onError?: (error: string) => void;
  onTimeout?: () => void;
}

export interface GameRoomCallbacks {
  onGameUpdate?: (gameData: any) => void;
  onError?: (error: string) => void;
}

// State
let queueEntryRef: DatabaseReference | null = null;
let queueOnDisconnect: ReturnType<typeof onDisconnect> | null = null;
let queueValueUnsubscribe: (() => void) | null = null;
let matchmakingTimeout: ReturnType<typeof setTimeout> | null = null;
let gameRoomRef: DatabaseReference | null = null;
let gameRoomUnsubscribe: (() => void) | null = null;
let isProcessingMatch = false;
let myPlayerId: string | null = null;
let myPlayerIndex: 0 | 1 | null = null;

// Sanitization helpers (match index.html)
function sanitizeName(name: any): string {
  if (typeof name !== 'string') return 'Player';
  return name.slice(0, 20).replace(/[<>]/g, '');
}

function sanitizeFlag(flag: any): string {
  if (typeof flag !== 'string') return '🌍';
  if (flag.length < 1 || flag.length > 8) return '🌍';
  return flag;
}

function sanitizeLevel(level: any): number {
  const num = parseInt(level, 10);
  if (isNaN(num) || num < 1 || num > 100) return 1;
  return num;
}

function sanitizeAvatarUrl(url: any): string | null {
  if (typeof url !== 'string') return null;
  if (!url.startsWith('https://')) return null;
  return url.slice(0, 500);
}

/**
 * Join the casual matchmaking queue
 */
export async function joinCasualQueue(
  profile: { displayName?: string; flag?: string; level?: number; avatarUrl?: string | null },
  gameMode: 301 | 501,
  callbacks: MatchmakingCallbacks
): Promise<void> {
  // Clean up any previous matchmaking state (prevents double-join)
  await cleanupMatchmaking();

  const database = getFirebaseDatabase();
  const functions = getFirebaseFunctions();

  if (!database) {
    callbacks.onError?.('Firebase not configured');
    return;
  }

  if (!functions) {
    callbacks.onError?.('Cloud Functions not available');
    return;
  }

  // Wait for authentication
  const authUser = await authReadyPromise;
  if (!authUser) {
    callbacks.onError?.('Authentication required for online play');
    return;
  }

  myPlayerId = authUser.uid;
  isProcessingMatch = false;

  callbacks.onSearching?.();

  const queueRef = ref(database, FIREBASE_PATHS.CASUAL_QUEUE);

  // Small delay to avoid race condition (matches index.html line 2343)
  setTimeout(async () => {
    try {
      // Look for available opponent in queue
      const queueQuery = query(queueRef, orderByChild('timestamp'), limitToFirst(1));
      const snapshot = await get(queueQuery);

      if (snapshot.exists()) {
        const opponents = snapshot.val();
        const opponentKey = Object.keys(opponents)[0];
        const opponentData = opponents[opponentKey] as QueueEntry;

        // Make sure we're not matching with ourselves (use key as ID)
        if (opponentKey !== myPlayerId) {
          // Found an opponent - create game
          await createGameWithOpponent(opponentKey, opponentData, profile, gameMode, queueRef, callbacks, functions);
          return;
        }
      }

      // No opponent found (or only ourselves) - add self to queue
      await addSelfToQueue(database, profile, callbacks, gameMode, functions);
    } catch (error: any) {
      console.error('[matchmaking] Error checking queue:', error);
      callbacks.onError?.(error.message || 'Failed to join queue');
    }
  }, 500);
}

/**
 * Add self to the matchmaking queue
 */
async function addSelfToQueue(
  database: any,
  profile: { displayName?: string; flag?: string; level?: number; avatarUrl?: string | null },
  callbacks: MatchmakingCallbacks,
  gameMode: 301 | 501,
  functions: any
): Promise<void> {
  if (!myPlayerId) return;

  const queueRef = ref(database, FIREBASE_PATHS.CASUAL_QUEUE);
  const myEntryRef = child(queueRef, myPlayerId);
  queueEntryRef = myEntryRef;

  const myQueueEntry: QueueEntry = {
    playerId: myPlayerId,
    name: sanitizeName(profile.displayName) || 'Player',
    flag: sanitizeFlag(profile.flag) || '🌍',
    level: profile.level || 1,
    avatarUrl: sanitizeAvatarUrl(profile.avatarUrl) || null,
    timestamp: serverTimestamp()
  };

  await set(myEntryRef, myQueueEntry);

  // Auto-remove from queue if user disconnects (matches index.html line 2456)
  queueOnDisconnect = onDisconnect(myEntryRef);
  await queueOnDisconnect.remove();

  // Listen for matchedGameId (when someone creates a game with us as player1)
  queueValueUnsubscribe = onValue(myEntryRef, async (snapshot) => {
    if (isProcessingMatch) return;
    if (!snapshot.exists()) return;

    const myEntry = snapshot.val() as QueueEntry;

    if (myEntry.matchedGameId) {
      isProcessingMatch = true;

      // Clean up
      await cleanupMatchmaking();

      const roomId = myEntry.matchedGameId;
      const opponentName = myEntry.matchedByName || 'Opponent';
      const opponentFlag = myEntry.matchedByFlag || '🌍';

      // Validate game exists and we're player1
      const gameRef = ref(database, `${FIREBASE_PATHS.GAMES}/${roomId}`);
      try {
        const gameSnap = await get(gameRef);
        const gameData = gameSnap.val();

        if (!gameData || gameData.player1?.id !== myPlayerId) {
          console.error('[matchmaking] Invalid game data');
          isProcessingMatch = false;
          callbacks.onError?.('Invalid game data');
          return;
        }

        myPlayerIndex = 0; // We're player1

        callbacks.onFound?.({
          roomId,
          playerIndex: 0,
          opponent: {
            name: sanitizeName(opponentName),
            flag: sanitizeFlag(opponentFlag),
            level: sanitizeLevel(gameData.player2?.level),
            avatarUrl: sanitizeAvatarUrl(gameData.player2?.avatarUrl)
          }
        });
      } catch (err: any) {
        console.error('[matchmaking] Failed to read game:', err);
        isProcessingMatch = false;
        callbacks.onError?.('Failed to join game');
      }
    }
  });

  // Timeout after 60 seconds (matches index.html line 2624)
  matchmakingTimeout = setTimeout(async () => {
    if (!isProcessingMatch) {
      await cleanupMatchmaking();
      callbacks.onTimeout?.();
    }
  }, 60000);
}

/**
 * Create a game with a found opponent
 */
async function createGameWithOpponent(
  opponentKey: string,
  opponent: QueueEntry,
  profile: { displayName?: string; flag?: string; level?: number; avatarUrl?: string | null },
  gameMode: 301 | 501,
  queueRef: DatabaseReference,
  callbacks: MatchmakingCallbacks,
  functions: any
): Promise<void> {
  if (!myPlayerId) {
    callbacks.onError?.('Not authenticated');
    return;
  }

  isProcessingMatch = true;

  try {
    const createGameFn = httpsCallable(functions, 'createGame');
    const result = await createGameFn({
      player1Id: opponentKey,
      player1Name: sanitizeName(opponent.name),
      player1Flag: sanitizeFlag(opponent.flag),
      player2Id: myPlayerId,
      player2Name: sanitizeName(profile.displayName) || 'Player',
      player2Flag: sanitizeFlag(profile.flag) || '🌍',
      gameMode: gameMode,
      isWagered: false
    });

    const data = result.data as any;
    if (!data.success || !data.gameId) {
      callbacks.onError?.(data.error || 'Failed to create game');
      isProcessingMatch = false;
      return;
    }

    const roomId = data.gameId;

    // Notify opponent by updating their queue entry with matchedGameId
    const opponentEntryRef = child(queueRef, opponentKey);
    await update(opponentEntryRef, {
      matchedGameId: roomId,
      matchedByName: sanitizeName(profile.displayName) || 'Player',
      matchedByFlag: sanitizeFlag(profile.flag) || '🌍'
    });

    myPlayerIndex = 1; // We're player2

    callbacks.onFound?.({
      roomId,
      playerIndex: 1,
      opponent: {
        name: sanitizeName(opponent.name),
        flag: sanitizeFlag(opponent.flag),
        level: sanitizeLevel(opponent.level),
        avatarUrl: sanitizeAvatarUrl(opponent.avatarUrl)
      }
    });
  } catch (error: any) {
    console.error('[matchmaking] Error creating game:', error);
    callbacks.onError?.(error.message || 'Failed to create game');
    isProcessingMatch = false;
  }
}

/**
 * Leave the matchmaking queue
 */
export async function leaveCasualQueue(): Promise<void> {
  await cleanupMatchmaking();
  myPlayerId = null;
}

/**
 * Internal cleanup helper
 */
async function cleanupMatchmaking(): Promise<void> {
  isProcessingMatch = false;

  if (matchmakingTimeout) {
    clearTimeout(matchmakingTimeout);
    matchmakingTimeout = null;
  }

  if (queueValueUnsubscribe) {
    queueValueUnsubscribe();
    queueValueUnsubscribe = null;
  }

  if (queueOnDisconnect) {
    await queueOnDisconnect.cancel();
    queueOnDisconnect = null;
  }

  if (queueEntryRef) {
    await remove(queueEntryRef);
    queueEntryRef = null;
  }
}

/**
 * Subscribe to a game room for real-time updates
 */
export function subscribeToGameRoom(
  roomId: string,
  playerIndex: 0 | 1,
  callbacks: GameRoomCallbacks
): void {
  const database = getFirebaseDatabase();
  if (!database) {
    callbacks.onError?.('Firebase not configured');
    return;
  }

  myPlayerIndex = playerIndex;
  const roomRef = ref(database, `${FIREBASE_PATHS.GAMES}/${roomId}`);
  gameRoomRef = roomRef;

  gameRoomUnsubscribe = onValue(roomRef, (snapshot) => {
    const gameData = snapshot.val();

    if (!gameData || !gameData.player1 || !gameData.player2 || !gameData.gameMode) {
      return;
    }

    callbacks.onGameUpdate?.(gameData);
  }, (error) => {
    console.error('[gameRoom] Listener error:', error);
    callbacks.onError?.('Connection to game lost');
  });
}

/**
 * Unsubscribe from game room
 */
export function unsubscribeFromGameRoom(): void {
  if (gameRoomUnsubscribe) {
    gameRoomUnsubscribe();
    gameRoomUnsubscribe = null;
  }
  gameRoomRef = null;
  myPlayerIndex = null;
}
