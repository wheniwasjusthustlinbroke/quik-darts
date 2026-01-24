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
  onOpponentDisconnect?: (opponentName: string) => void;
  onError?: (error: string) => void;
}

export interface ThrowPayload {
  gameId: string;
  dartPosition: { x: number; y: number };
  aimPoint?: { x: number; y: number };
  powerValue?: number;
  throwId?: string;
}

export interface ThrowResult {
  success: boolean;
  label?: string;
  score?: number;
  rhythm?: string;
  positionAdjusted?: boolean;
  adjustedPosition?: { x: number; y: number };
  error?: string;
}

// State
let queueEntryRef: DatabaseReference | null = null;
let queueOnDisconnect: ReturnType<typeof onDisconnect> | null = null;
let queueValueUnsubscribe: (() => void) | null = null;
let matchmakingTimeout: ReturnType<typeof setTimeout> | null = null;
let gameRoomRef: DatabaseReference | null = null;
let gameRoomUnsubscribe: (() => void) | null = null;
let gameRoomOnDisconnect: ReturnType<typeof onDisconnect> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let opponentWasConnected = false;
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

// Heartbeat constants (match index.html lines 2654, 2668)
const HEARTBEAT_INTERVAL_MS = 3000;
const HEARTBEAT_STALE_THRESHOLD_MS = 15000;

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
  opponentWasConnected = false;
  const roomRef = ref(database, `${FIREBASE_PATHS.GAMES}/${roomId}`);
  gameRoomRef = roomRef;

  const myPlayerKey = playerIndex === 0 ? 'player1' : 'player2';
  const opponentKey = playerIndex === 0 ? 'player2' : 'player1';
  const myPlayerRef = child(roomRef, myPlayerKey);
  const myConnectedRef = child(roomRef, `${myPlayerKey}/connected`);

  // Set my presence as connected + initial heartbeat together (atomic)
  void update(myPlayerRef, {
    connected: true,
    lastHeartbeat: Date.now()
  }).catch((err) => {
    callbacks.onError?.('Failed to set presence: ' + err.message);
  });

  // Auto-set connected=false when I disconnect (matches index.html line 2726)
  gameRoomOnDisconnect = onDisconnect(myConnectedRef);
  void gameRoomOnDisconnect.set(false).catch((err) => {
    console.error('[gameRoom] Failed to register onDisconnect:', err);
  });

  // Start heartbeat interval (every 3s, matches index.html line 2654)
  let heartbeatFailed = false;
  heartbeatInterval = setInterval(() => {
    if (heartbeatFailed) return;
    void update(myPlayerRef, { lastHeartbeat: Date.now() }).catch((err) => {
      if (!heartbeatFailed) {
        heartbeatFailed = true;
        callbacks.onError?.('Heartbeat failed: ' + err.message);
      }
    });
  }, HEARTBEAT_INTERVAL_MS);

  gameRoomUnsubscribe = onValue(roomRef, (snapshot) => {
    const gameData = snapshot.val();

    if (!gameData || !gameData.player1 || !gameData.player2 || !gameData.gameMode) {
      return;
    }

    const opponent = gameData[opponentKey];
    if (!opponent) {
      return;
    }

    // Track if opponent was ever connected (matches index.html line 2751-2753)
    if (opponent.connected === true) {
      opponentWasConnected = true;
    }

    // Detect opponent disconnect (matches index.html line 2756-2799)
    // Fire callback but continue to allow onGameUpdate
    if (opponentWasConnected && !gameData.winner) {
      const isDisconnected = opponent.connected === false;
      const isHeartbeatStale = opponent.lastHeartbeat &&
        (Date.now() - opponent.lastHeartbeat > HEARTBEAT_STALE_THRESHOLD_MS);

      if (isDisconnected || isHeartbeatStale) {
        opponentWasConnected = false; // Prevent repeat callbacks
        callbacks.onOpponentDisconnect?.(sanitizeName(opponent.name));
      }
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
  // Clear heartbeat interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Cancel onDisconnect handler
  if (gameRoomOnDisconnect) {
    void gameRoomOnDisconnect.cancel().catch(() => {});
    gameRoomOnDisconnect = null;
  }

  // Set connected=false before leaving (if we still have refs)
  if (gameRoomRef && myPlayerIndex !== null) {
    const myPlayerKey = myPlayerIndex === 0 ? 'player1' : 'player2';
    void set(child(gameRoomRef, `${myPlayerKey}/connected`), false).catch(() => {});
  }

  // Unsubscribe from game room listener
  if (gameRoomUnsubscribe) {
    gameRoomUnsubscribe();
    gameRoomUnsubscribe = null;
  }

  gameRoomRef = null;
  myPlayerIndex = null;
  opponentWasConnected = false;
}

/**
 * Submit a dart throw to the server
 */
export async function submitThrow(payload: ThrowPayload): Promise<ThrowResult | null> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    console.error('[submitThrow] Cloud Functions not available');
    return null;
  }

  const submitThrowFn = httpsCallable(functions, 'submitThrow');
  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[submitThrow] Attempt ${attempt + 1}:`, payload.dartPosition);
      const result = await submitThrowFn(payload);
      const data = result.data as ThrowResult;

      if (!data.success) {
        console.error('[submitThrow] Rejected by server:', data.error);
        return null;
      }

      console.log('[submitThrow] Accepted:', data.label, data.score, 'pts');
      return data;
    } catch (error: any) {
      lastError = error;
      console.error(`[submitThrow] Attempt ${attempt + 1} failed:`, error.message);

      if (error.code === 'functions/failed-precondition' ||
          error.code === 'functions/permission-denied') {
        return null;
      }

      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }

  console.error('[submitThrow] All retries failed:', lastError);
  return null;
}

// === Escrow Types ===

export interface CreateEscrowParams {
  stakeAmount: number;
  escrowId?: string; // If provided, join existing escrow
  idempotencyKey?: string;
}

export interface CreateEscrowResult {
  success: boolean;
  escrowId?: string;
  newBalance?: number;
  error?: string;
}

export interface RefundEscrowParams {
  escrowId: string;
  reason: string;
  idempotencyKey?: string;
}

export interface RefundEscrowResult {
  success: boolean;
  newBalance?: number;
  error?: string;
}

export interface SettleGameParams {
  gameId: string;
}

export interface SettleGameResult {
  success: boolean;
  winnerId?: string;
  winnerPayout?: number;
  error?: string;
}

export interface ForfeitGameParams {
  gameId: string;
  forfeitPlayerId: string;
}

export interface ForfeitGameResult {
  success: boolean;
  winnerId?: string;
  winnerPayout?: number;
  error?: string;
}

// === Escrow Cloud Function Wrappers ===

/**
 * Create or join an escrow for wagered matches.
 * If escrowId is provided, joins existing escrow. Otherwise creates new one.
 */
export async function createEscrow(params: CreateEscrowParams): Promise<CreateEscrowResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    return { success: false, error: 'Cloud Functions not available' };
  }

  try {
    const createEscrowFn = httpsCallable(functions, 'createEscrow');
    const result = await createEscrowFn(params);
    const data = result.data as CreateEscrowResult;

    if (!data.success) {
      console.error('[createEscrow] Failed:', data.error);
    }

    return data;
  } catch (error: any) {
    console.error('[createEscrow] Error:', error.message);
    return { success: false, error: error.message || 'Failed to create escrow' };
  }
}

/**
 * Refund an escrow (cancel wagered matchmaking).
 */
export async function refundEscrow(params: RefundEscrowParams): Promise<RefundEscrowResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    return { success: false, error: 'Cloud Functions not available' };
  }

  try {
    const refundEscrowFn = httpsCallable(functions, 'refundEscrow');
    const result = await refundEscrowFn(params);
    const data = result.data as RefundEscrowResult;

    if (!data.success) {
      console.error('[refundEscrow] Failed:', data.error);
    }

    return data;
  } catch (error: any) {
    console.error('[refundEscrow] Error:', error.message);
    return { success: false, error: error.message || 'Failed to refund escrow' };
  }
}

/**
 * Settle a completed wagered game (award winner).
 */
export async function settleGame(params: SettleGameParams): Promise<SettleGameResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    return { success: false, error: 'Cloud Functions not available' };
  }

  try {
    const settleGameFn = httpsCallable(functions, 'settleGame');
    const result = await settleGameFn(params);
    const data = result.data as SettleGameResult;

    if (!data.success) {
      console.error('[settleGame] Failed:', data.error);
    }

    return data;
  } catch (error: any) {
    console.error('[settleGame] Error:', error.message);
    return { success: false, error: error.message || 'Failed to settle game' };
  }
}

/**
 * Forfeit a wagered game (opponent disconnected).
 */
export async function forfeitGame(params: ForfeitGameParams): Promise<ForfeitGameResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    return { success: false, error: 'Cloud Functions not available' };
  }

  try {
    const forfeitGameFn = httpsCallable(functions, 'forfeitGame');
    const result = await forfeitGameFn(params);
    const data = result.data as ForfeitGameResult;

    if (!data.success) {
      console.error('[forfeitGame] Failed:', data.error);
    }

    return data;
  } catch (error: any) {
    console.error('[forfeitGame] Error:', error.message);
    return { success: false, error: error.message || 'Failed to forfeit game' };
  }
}
