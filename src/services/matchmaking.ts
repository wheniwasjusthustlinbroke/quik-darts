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
  runTransaction,
  DatabaseReference,
} from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDatabase, getFirebaseFunctions, authReadyPromise } from './firebase';
import { FIREBASE_PATHS } from '../utils/firebase';

// Debug tag for correlating logs across tabs
const MM_DEBUG_TAG = `mm:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Types
export interface QueueEntry {
  playerId: string;
  name: string;
  flag: string;
  level: number;
  avatarUrl: string | null;
  timestamp: object; // serverTimestamp()
  gameMode?: 301 | 501;
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
let casualRecheckTimeout: ReturnType<typeof setTimeout> | null = null;
let recheckInFlight = false; // Guard to prevent overlapping async rechecks
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
  console.log(`[matchmaking][${MM_DEBUG_TAG}] Join start:`, {
    myPlayerId,
    authUid: authUser?.uid ?? null,
    gameMode,
    queuePath: FIREBASE_PATHS.CASUAL_QUEUE
  });
  isProcessingMatch = false;

  callbacks.onSearching?.();

  const queueRef = ref(database, FIREBASE_PATHS.CASUAL_QUEUE);

  // Small delay to avoid race condition (matches index.html line 2343)
  setTimeout(async () => {
    try {
      // Look for available opponents in queue (query multiple to avoid stale head)
      const queueQuery = query(queueRef, orderByChild('timestamp'), limitToFirst(5));
      const snapshot = await get(queueQuery);

      if (snapshot.exists()) {
        // Build ordered candidate list using forEach to preserve Firebase ordering
        const candidates: Array<{ key: string; entry: QueueEntry }> = [];
        snapshot.forEach((childSnap) => {
          candidates.push({ key: childSnap.key!, entry: childSnap.val() as QueueEntry });
        });

        // Try each candidate in order
        for (const { key: opponentKey, entry } of candidates) {
          // Skip self
          if (opponentKey === myPlayerId) continue;
          // Skip already matched
          if (entry.matchedGameId != null) continue;

          // Deterministic initiator: only higher UID calls createGame
          // Lower UID waits for matchedGameId via listener
          if (myPlayerId! < opponentKey) continue;

          try {
            const matched = await createGameWithOpponent(opponentKey, entry, profile, gameMode, queueRef, callbacks, functions);
            if (matched) return; // Success - exit
          } catch (err: any) {
            // Only treat race condition as retryable, rethrow everything else
            if (err?.code === 'functions/failed-precondition') {
              console.debug('[matchmaking] Candidate race:', opponentKey);
              continue;
            }
            throw err;
          }
        }
        // All candidates failed - fall through to add self to queue
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
    gameMode,
    timestamp: serverTimestamp()
  };

  // Use update() to merge fields without overwriting matchedGameId if it exists
  await update(myEntryRef, myQueueEntry);

  // Non-blocking verification - fire and forget
  void get(myEntryRef)
    .then((verifySnap) => {
      console.log(`[matchmaking][${MM_DEBUG_TAG}] Queue entry verify:`, {
        exists: verifySnap.exists(),
        playerId: verifySnap.val()?.playerId ?? null,
        matchedGameId: verifySnap.val()?.matchedGameId ?? null,
        timestamp: verifySnap.val()?.timestamp ?? null,
        timestampType: typeof verifySnap.val()?.timestamp,
        allKeys: Object.keys(verifySnap.val() || {}),
      });
    })
    .catch((e) => console.error(`[matchmaking][${MM_DEBUG_TAG}] Queue entry verify ERROR:`, {
      code: (e as any)?.code ?? null,
      message: (e as any)?.message ?? null,
    }));

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

      // Wait for game with retry (server may still be creating it after setting matchedGameId)
      const gameRef = ref(database, `${FIREBASE_PATHS.GAMES}/${roomId}`);
      let gameData: any = null;
      const maxRetries = 5;
      const baseDelay = 200;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const gameSnap = await get(gameRef);
          gameData = gameSnap.val();

          // Success - game exists and we're player1
          if (gameData && gameData.player1?.id === myPlayerId) {
            break;
          }

          // Fail fast: game exists with different player1 (not transient)
          if (gameData?.player1?.id && gameData.player1.id !== myPlayerId) {
            console.error('[matchmaking] Game has wrong player1:', gameData.player1.id);
            isProcessingMatch = false;
            callbacks.onError?.('Invalid game data');
            return;
          }

          // Game not ready (null/missing) - retry
          if (attempt < maxRetries - 1) {
            console.log(`[matchmaking] Game not ready (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));
          }
        } catch (err: any) {
          // Permission denied likely means game not created yet - retry
          if (attempt < maxRetries - 1) {
            console.log(`[matchmaking] Game read error (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));
            continue;
          }
          console.error('[matchmaking] Failed to read game after retries:', err);
          isProcessingMatch = false;
          callbacks.onError?.('Failed to join game');
          return;
        }
      }

      if (!gameData || gameData.player1?.id !== myPlayerId) {
        console.error('[matchmaking] Invalid game data after retries');
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
    }
  });

  // Timeout after 60 seconds (matches index.html line 2624)
  matchmakingTimeout = setTimeout(async () => {
    if (!isProcessingMatch) {
      await cleanupMatchmaking();
      callbacks.onTimeout?.();
    }
  }, 60000);

  // Recurring recheck: catches opponents who join after us (recursive setTimeout)
  scheduleCasualRecheck(queueRef, profile, gameMode, callbacks, functions, 2000 + Math.floor(Math.random() * 1000));
}

/**
 * Create a game with a found opponent
 */
async function createGameWithOpponent(
  opponentKey: string,
  opponent: QueueEntry,
  profile: { displayName?: string; flag?: string; level?: number; avatarUrl?: string | null },
  gameMode: 301 | 501,
  _queueRef: DatabaseReference,
  callbacks: MatchmakingCallbacks,
  functions: any
): Promise<boolean> {
  if (!myPlayerId) {
    callbacks.onError?.('Not authenticated');
    return false;
  }

  isProcessingMatch = true;
  console.log(`[matchmaking][${MM_DEBUG_TAG}] createGameWithOpponent START:`, {
    myPlayerId,
    opponentKey,
    opponentName: opponent?.name ?? null,
    gameMode,
    isProcessingMatch
  });
  let success = false;

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
    console.log(`[matchmaking][${MM_DEBUG_TAG}] createGame response:`, {
      success: data?.success ?? null,
      gameId: data?.gameId ?? null,
      error: data?.error ?? null
    });
    if (!data.success || !data.gameId) {
      callbacks.onError?.(data.error || 'Failed to create game');
      return false;
    }

    myPlayerIndex = 1; // We're player2
    success = true;

    // Cleanup before callback - stops recheck loop via queueEntryRef = null
    await cleanupMatchmaking();

    callbacks.onFound?.({
      roomId: data.gameId,
      playerIndex: 1,
      opponent: {
        name: sanitizeName(opponent.name),
        flag: sanitizeFlag(opponent.flag),
        level: sanitizeLevel(opponent.level),
        avatarUrl: sanitizeAvatarUrl(opponent.avatarUrl)
      }
    });
    return true;
  } catch (error: any) {
    console.error('[matchmaking] Error creating game:', error);
    console.error(`[matchmaking][${MM_DEBUG_TAG}] createGameWithOpponent ERROR:`, {
      code: error?.code ?? null,
      message: error?.message ?? null
    });
    // Known race: opponent's queue entry gone before server could claim it
    if (error.code === 'functions/failed-precondition' ||
        error.message?.includes('Opponent not available')) {
      return false;
    }
    // Real errors — surface to user
    callbacks.onError?.(error.message || 'Failed to create game');
    return false;
  } finally {
    if (!success) isProcessingMatch = false;
    console.log(`[matchmaking][${MM_DEBUG_TAG}] createGameWithOpponent END:`, {
      success,
      isProcessingMatch
    });
  }
}

/**
 * Schedule a casual recheck with recursive setTimeout (not setInterval).
 * Guarantees no overlapping async rechecks via recheckInFlight guard.
 * Stops when: cleanup called (queueEntryRef nulled).
 */
function scheduleCasualRecheck(
  queueRef: DatabaseReference,
  profile: { displayName?: string; flag?: string; level?: number; avatarUrl?: string | null },
  gameMode: 301 | 501,
  callbacks: MatchmakingCallbacks,
  functions: any,
  delayMs: number = 3000
): void {
  const isActiveQueueSession = (): boolean => {
    if (!queueEntryRef || !myPlayerId) return false;
    return queueEntryRef.parent?.toString() === queueRef.toString();
  };

  // Clear any existing timeout before scheduling new one
  if (casualRecheckTimeout) {
    clearTimeout(casualRecheckTimeout);
    casualRecheckTimeout = null;
  }

  casualRecheckTimeout = setTimeout(async () => {
    // Hard stop: cleanup happened or new session started (stale closure guard)
    if (!isActiveQueueSession()) {
      console.log(`[matchmaking][${MM_DEBUG_TAG}] Recheck stopped: cleanup or stale`);
      return;
    }

    // Overlap guard: previous recheck still running - reschedule shortly
    if (recheckInFlight) {
      console.log(`[matchmaking][${MM_DEBUG_TAG}] Recheck skipped (in-flight), rescheduling`);
      scheduleCasualRecheck(queueRef, profile, gameMode, callbacks, functions, 1000);
      return;
    }

    // createGame attempt in flight - reschedule, don't stop
    if (isProcessingMatch) {
      console.log(`[matchmaking][${MM_DEBUG_TAG}] Recheck deferred (processing match)`);
      scheduleCasualRecheck(queueRef, profile, gameMode, callbacks, functions, 1000);
      return;
    }

    recheckInFlight = true;
    try {
      console.log(`[matchmaking][${MM_DEBUG_TAG}] Recheck executing`, { time: Date.now() });

      const recheckQuery = query(queueRef, orderByChild('timestamp'), limitToFirst(5));
      const recheckSnap = await get(recheckQuery);
      const snapshotVal = recheckSnap.val() || {};
      console.log(`[matchmaking][${MM_DEBUG_TAG}] Recheck snapshot:`, {
        exists: recheckSnap.exists(),
        numChildren: Object.keys(snapshotVal).length,
        keys: Object.keys(snapshotVal).slice(0, 10)
      });

      if (!recheckSnap.exists()) {
        return; // No entries - will reschedule in finally
      }

      const entries = Object.entries(recheckSnap.val()) as [string, QueueEntry][];

      for (const [key, val] of entries) {
        // Re-check stop condition during iteration (use break to let finally reschedule)
        if (!isActiveQueueSession()) break;
        if (isProcessingMatch) break;
        if (key === myPlayerId) continue;
        if ((val as any).matchedGameId) continue;

        // Deterministic initiator: only higher UID calls createGame
        if (myPlayerId! < key) continue;

        console.log(`[matchmaking][${MM_DEBUG_TAG}] Recheck: calling createGameWithOpponent`, { key });
        const matched = await createGameWithOpponent(key, val, profile, gameMode, queueRef, callbacks, functions);
        if (matched) return; // Success - cleanup already called, don't reschedule
      }
    } catch (err) {
      console.error('[matchmaking] Recheck error:', err);
    } finally {
      recheckInFlight = false;
      // Always reschedule if still queued (cleanup sets queueEntryRef = null)
      // Use shorter delay if createGame is in flight
      if (isActiveQueueSession()) {
        const nextDelay = isProcessingMatch ? 1000 : 3000 + Math.floor(Math.random() * 1000);
        scheduleCasualRecheck(queueRef, profile, gameMode, callbacks, functions, nextDelay);
      }
    }
  }, Math.floor(delayMs));
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

  if (casualRecheckTimeout) {
    clearTimeout(casualRecheckTimeout);
    casualRecheckTimeout = null;
  }
  recheckInFlight = false; // Reset guard to prevent stale state

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

// TODO: verify Cloud Function forfeitGame is idempotent/transactional and enforces auth
export interface ForfeitGameParams {
  gameId: string;
  reason: string;
  claimWin: boolean;
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

// === Wagered Matchmaking Types ===

export interface WageredQueueEntry extends QueueEntry {
  escrowId: string;
  stakeAmount: number;
  claimedBy?: string; // UID of player who claimed this entry
}

export interface WageredMatchCallbacks {
  onSearching?: () => void;
  onEscrowCreated?: (escrowId: string, newBalance: number) => void;
  onFound?: (data: MatchFoundData & { escrowId: string; stakeAmount: number }) => void;
  onError?: (error: string) => void;
  onTimeout?: (refundFailed?: boolean) => void;
}

// === Wagered Matchmaking State ===

let wageredQueueEntryRef: DatabaseReference | null = null;
let wageredQueueOnDisconnect: ReturnType<typeof onDisconnect> | null = null;
let wageredQueueValueUnsubscribe: (() => void) | null = null;
let wageredEscrowGameIdUnsubscribe: (() => void) | null = null;
let wageredMatchmakingTimeout: ReturnType<typeof setTimeout> | null = null;
let currentEscrowId: string | null = null;
let currentIdempotencyKey: string | null = null;
let isProcessingWageredMatch = false;

/**
 * Generate a unique idempotency key for this matchmaking attempt
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Atomically claim an opponent's queue entry.
 * Returns true if we won the claim, false if someone else did.
 */
async function tryClaimOpponent(opponentEntryRef: DatabaseReference, myUid: string): Promise<boolean> {
  try {
    // First check if entry exists and is available
    const snapshot = await get(opponentEntryRef);
    if (!snapshot.exists()) return false;
    const data = snapshot.val();
    if (data.claimedBy || data.matchedGameId) return false;

    // Write only to claimedBy child (not entire entry) to satisfy child rule
    const claimedByRef = child(opponentEntryRef, 'claimedBy');
    const result = await runTransaction(claimedByRef, (current) => {
      if (current !== null) {
        // Already claimed - abort
        return undefined;
      }
      return myUid;
    });

    return result.committed && result.snapshot.val() === myUid;
  } catch (error) {
    console.error('[tryClaimOpponent] Transaction failed:', error);
    return false;
  }
}

/**
 * Join the wagered matchmaking queue.
 * Creates escrow, checks for opponent, or adds self to queue.
 */
export async function joinWageredQueue(
  profile: { displayName?: string; flag?: string; level?: number; avatarUrl?: string | null },
  stakeAmount: number,
  gameMode: 301 | 501,
  callbacks: WageredMatchCallbacks
): Promise<void> {
  // Clean up any previous wagered matchmaking state
  await cleanupWageredMatchmaking();

  const database = getFirebaseDatabase();
  const functions = getFirebaseFunctions();

  if (!database || !functions) {
    callbacks.onError?.('Firebase not configured');
    return;
  }

  const authUser = await authReadyPromise;
  if (!authUser || authUser.isAnonymous) {
    callbacks.onError?.('Please sign in to play wagered matches');
    return;
  }

  const playerId = authUser.uid;
  myPlayerId = playerId;
  currentIdempotencyKey = generateIdempotencyKey();
  isProcessingWageredMatch = false;

  callbacks.onSearching?.();

  const wageredQueueRef = ref(database, `matchmaking_queue/wagered/${stakeAmount}`);

  try {
    // Background cleanup of stale escrows for this user (fire-and-forget)
    // Matches index.html lines 5078-5083
    void refundEscrow({
      escrowId: 'cleanup_pending',
      reason: 'cleanup_before_new_match',
      idempotencyKey: `${currentIdempotencyKey}-cleanup`,
    });

    // Check queue for opponents
    const queueQuery = query(wageredQueueRef, orderByChild('timestamp'), limitToFirst(5));
    const snapshot = await get(queueQuery);

    if (snapshot.exists()) {
      const entries = snapshot.val();

      // Try to claim an opponent atomically
      for (const [opponentKey, opponentData] of Object.entries(entries) as [string, WageredQueueEntry][]) {
        // Skip self, already claimed, or already matched entries
        if (opponentKey === playerId) continue;
        if (opponentData.claimedBy || opponentData.matchedGameId) continue;
        if (!opponentData.escrowId) continue;

        const opponentEntryRef = child(wageredQueueRef, opponentKey);
        const claimed = await tryClaimOpponent(opponentEntryRef, playerId);

        if (claimed) {
          // We won the claim - join their escrow
          const joinResult = await createEscrow({
            escrowId: opponentData.escrowId,
            stakeAmount,
            idempotencyKey: currentIdempotencyKey,
          });

          if (joinResult.success) {
            currentEscrowId = opponentData.escrowId;
            console.log('[wageredMatchmaking] currentEscrowId SET (joined opponent):', currentEscrowId);
            callbacks.onEscrowCreated?.(opponentData.escrowId, joinResult.newBalance ?? 0);

            await createWageredGameWithOpponent(
              opponentKey,
              opponentData,
              profile,
              gameMode,
              stakeAmount,
              wageredQueueRef,
              callbacks,
              functions
            );
            return;
          }

          // Failed to join escrow - release claim and try next
          // Release claim via child path transaction
          await runTransaction(child(opponentEntryRef, 'claimedBy'), (current) => {
            if (current === playerId) return null;
            return; // abort if not our claim
          });
        }
      }
    }

    // No opponent claimed - create own escrow and add to queue
    const escrowResult = await createEscrow({
      stakeAmount,
      idempotencyKey: currentIdempotencyKey,
    });

    if (!escrowResult.success || !escrowResult.escrowId) {
      callbacks.onError?.(escrowResult.error || 'Failed to create escrow');
      return;
    }

    currentEscrowId = escrowResult.escrowId;
    console.log('[wageredMatchmaking] currentEscrowId SET (created own):', currentEscrowId);
    callbacks.onEscrowCreated?.(escrowResult.escrowId, escrowResult.newBalance ?? 0);

    await addSelfToWageredQueue(
      database,
      profile,
      stakeAmount,
      escrowResult.escrowId,
      wageredQueueRef,
      gameMode,
      callbacks,
      functions
    );
  } catch (error: any) {
    console.error('[wageredMatchmaking] Error:', error);
    callbacks.onError?.(error.message || 'Failed to start wagered match');
    await cleanupWageredMatchmaking();
  }
}

/**
 * Add self to wagered queue and listen for match
 */
async function addSelfToWageredQueue(
  database: any,
  profile: { displayName?: string; flag?: string; level?: number; avatarUrl?: string | null },
  stakeAmount: number,
  escrowId: string,
  wageredQueueRef: DatabaseReference,
  gameMode: 301 | 501,
  callbacks: WageredMatchCallbacks,
  _functions: any
): Promise<void> {
  if (!myPlayerId) return;

  const myEntryRef = child(wageredQueueRef, myPlayerId);
  wageredQueueEntryRef = myEntryRef;

  const myQueueEntry: WageredQueueEntry = {
    playerId: myPlayerId,
    name: sanitizeName(profile.displayName) || 'Player',
    flag: sanitizeFlag(profile.flag) || '🌍',
    level: profile.level || 1,
    avatarUrl: sanitizeAvatarUrl(profile.avatarUrl) || null,
    gameMode,
    timestamp: serverTimestamp(),
    escrowId,
    stakeAmount,
  };

  // Use update() to merge fields without overwriting matchedGameId/claimedBy if they exist
  await update(myEntryRef, myQueueEntry);

  // Auto-remove from queue on disconnect
  wageredQueueOnDisconnect = onDisconnect(myEntryRef);
  await wageredQueueOnDisconnect.remove();

  // Listen for matchedGameId or claimedBy
  wageredQueueValueUnsubscribe = onValue(myEntryRef, async (snapshot) => {
    if (isProcessingWageredMatch) return;
    if (!snapshot.exists()) return;

    const myEntry = snapshot.val() as WageredQueueEntry & { matchedGameId?: string; matchedByName?: string; matchedByFlag?: string };

    if (myEntry.matchedGameId) {
      isProcessingWageredMatch = true;

      await cleanupWageredMatchmaking();

      const roomId = myEntry.matchedGameId;
      const opponentName = myEntry.matchedByName || 'Opponent';
      const opponentFlag = myEntry.matchedByFlag || '🌍';

      // Wait for game with retry (server may still be creating it after setting matchedGameId)
      const gameRef = ref(database, `${FIREBASE_PATHS.GAMES}/${roomId}`);
      let gameData: any = null;
      const maxRetries = 5;
      const baseDelay = 200;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const gameSnap = await get(gameRef);
          gameData = gameSnap.val();

          // Success - game exists and we're player1
          if (gameData && gameData.player1?.id === myPlayerId) {
            break;
          }

          // Fail fast: game exists with different player1 (not transient)
          if (gameData?.player1?.id && gameData.player1.id !== myPlayerId) {
            console.error('[matchmaking] Wagered game has wrong player1:', gameData.player1.id);
            isProcessingWageredMatch = false;
            callbacks.onError?.('Invalid game data');
            return;
          }

          // Game not ready (null/missing) - retry
          if (attempt < maxRetries - 1) {
            console.log(`[matchmaking] Wagered game not ready (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));
          }
        } catch (err: any) {
          // Permission denied likely means game not created yet - retry
          if (attempt < maxRetries - 1) {
            console.log(`[matchmaking] Wagered game read error (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));
            continue;
          }
          console.error('[matchmaking] Failed to read wagered game after retries:', err);
          isProcessingWageredMatch = false;
          callbacks.onError?.('Failed to join game');
          return;
        }
      }

      if (!gameData || gameData.player1?.id !== myPlayerId) {
        console.error('[matchmaking] Invalid wagered game data after retries');
        isProcessingWageredMatch = false;
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
          avatarUrl: sanitizeAvatarUrl(gameData.player2?.avatarUrl),
        },
        escrowId: gameData.wager?.escrowId || escrowId,
        stakeAmount,
      });
    }
  });

  // Fallback: listen on escrow for gameId (covers case where queue notification failed)
  const escrowGameIdRef = ref(database, `escrow/${escrowId}/gameId`);
  wageredEscrowGameIdUnsubscribe = onValue(escrowGameIdRef, async (snapshot) => {
    if (isProcessingWageredMatch) return;
    if (!snapshot.exists()) return;

    const matchedGameId = snapshot.val() as string;
    if (!matchedGameId || typeof matchedGameId !== 'string') return;

    // Fire-once: unsubscribe immediately before any await
    const unsub = wageredEscrowGameIdUnsubscribe;
    wageredEscrowGameIdUnsubscribe = null;
    unsub?.();

    isProcessingWageredMatch = true;
    let success = false;
    try {
      // Validate escrow is still in a valid state before proceeding
      const escrowSnap = await get(ref(database, `escrow/${escrowId}`));
      const escrowData = escrowSnap.val();
      if (!escrowData || escrowData.status === 'refunded' || escrowData.status === 'released') {
        return; // Escrow was already settled/refunded — don't join the game
      }

      await cleanupWageredMatchmaking();
      isProcessingWageredMatch = true; // Re-set after cleanup (cleanup resets to false)

      // Fetch game data with retry (server may still be creating it)
      const gameRef = ref(database, `${FIREBASE_PATHS.GAMES}/${matchedGameId}`);
      let gameData: any = null;
      const maxRetries = 5;
      const baseDelay = 200;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const gameSnap = await get(gameRef);
          gameData = gameSnap.val();

          if (gameData && gameData.player1?.id === myPlayerId) {
            break;
          }

          if (gameData?.player1?.id && gameData.player1.id !== myPlayerId) {
            console.error('[matchmaking] Escrow game has wrong player1:', gameData.player1.id);
            callbacks.onError?.('Invalid game data');
            return;
          }

          if (attempt < maxRetries - 1) {
            console.log(`[matchmaking] Escrow game not ready (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));
          }
        } catch (err: any) {
          if (attempt < maxRetries - 1) {
            console.log(`[matchmaking] Escrow game read error (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));
            continue;
          }
          console.error('[matchmaking] Failed to read escrow game after retries:', err);
          callbacks.onError?.('Failed to join game');
          return;
        }
      }

      if (!gameData || gameData.player1?.id !== myPlayerId) {
        console.error('[matchmaking] Invalid escrow game data after retries');
        callbacks.onError?.('Invalid game data');
        return;
      }

      myPlayerIndex = 0; // We're player1

      success = true;
      callbacks.onFound?.({
        roomId: matchedGameId,
        playerIndex: 0,
        opponent: {
          name: sanitizeName(gameData.player2?.name),
          flag: sanitizeFlag(gameData.player2?.flag),
          level: sanitizeLevel(gameData.player2?.level),
          avatarUrl: sanitizeAvatarUrl(gameData.player2?.avatarUrl),
        },
        escrowId,
        stakeAmount,
      });
    } catch (err: any) {
      callbacks.onError?.('Failed to join game');
    } finally {
      if (!success) isProcessingWageredMatch = false;
    }
  });

  // Timeout after 30 seconds for wagered matches
  wageredMatchmakingTimeout = setTimeout(async () => {
    console.log('[wageredMatchmaking] Timeout fired:', { isProcessingWageredMatch, currentEscrowId });
    if (!isProcessingWageredMatch) {
      const result = await leaveWageredQueue();
      callbacks.onTimeout?.(result.refundFailed);
    }
  }, 30000);
}

/**
 * Create wagered game with found opponent
 */
async function createWageredGameWithOpponent(
  opponentKey: string,
  opponent: WageredQueueEntry,
  profile: { displayName?: string; flag?: string; level?: number; avatarUrl?: string | null },
  gameMode: 301 | 501,
  stakeAmount: number,
  wageredQueueRef: DatabaseReference,
  callbacks: WageredMatchCallbacks,
  functions: any
): Promise<void> {
  if (!myPlayerId || !currentEscrowId) {
    callbacks.onError?.('Not authenticated');
    return;
  }

  isProcessingWageredMatch = true;
  const opponentEntryRef = child(wageredQueueRef, opponentKey);

  try {
    const createGameFn = httpsCallable(functions, 'createGame');
    const result = await createGameFn({
      player1Id: opponentKey,
      player1Name: sanitizeName(opponent.name),
      player1Flag: sanitizeFlag(opponent.flag),
      player2Id: myPlayerId,
      player2Name: sanitizeName(profile.displayName) || 'Player',
      player2Flag: sanitizeFlag(profile.flag) || '🌍',
      gameMode,
      isWagered: true,
      escrowId: currentEscrowId,
      stakeAmount,
    });

    const data = result.data as any;
    if (!data.success || !data.gameId) {
      // createGame failed - try to refund escrow (server may have already handled it)
      if (currentEscrowId && currentIdempotencyKey) {
        try {
          await refundEscrow({
            escrowId: currentEscrowId,
            reason: 'create_game_failed',
            idempotencyKey: `${currentIdempotencyKey}-refund-create-game`,
          });
        } catch (refundErr) {
          console.error('[wageredMatchmaking] Client refund failed (server may have handled it):', refundErr);
        }
      }
      // Release claim to avoid stuck opponents
      // Release claim via child path transaction
      await runTransaction(child(opponentEntryRef, 'claimedBy'), (current) => {
        if (current === myPlayerId) return null;
        return; // abort if not our claim
      });
      callbacks.onError?.(data.error || 'Failed to create game');
      isProcessingWageredMatch = false;
      return;
    }

    const roomId = data.gameId;

    // Server now handles match assignment in createGame Cloud Function

    myPlayerIndex = 1; // We're player2

    callbacks.onFound?.({
      roomId,
      playerIndex: 1,
      opponent: {
        name: sanitizeName(opponent.name),
        flag: sanitizeFlag(opponent.flag),
        level: sanitizeLevel(opponent.level),
        avatarUrl: sanitizeAvatarUrl(opponent.avatarUrl),
      },
      escrowId: currentEscrowId,
      stakeAmount,
    });
  } catch (error: any) {
    console.error('[wageredMatchmaking] Error creating game:', error);
    // createGame threw - try to refund escrow (server may have already handled it)
    if (currentEscrowId && currentIdempotencyKey) {
      try {
        await refundEscrow({
          escrowId: currentEscrowId,
          reason: 'create_game_failed',
          idempotencyKey: `${currentIdempotencyKey}-refund-create-game`,
        });
      } catch (refundErr) {
        console.error('[wageredMatchmaking] Client refund failed (server may have handled it):', refundErr);
      }
    }
    // Release claim to avoid stuck opponents
    // Release claim via child path transaction
    await runTransaction(child(opponentEntryRef, 'claimedBy'), (current) => {
      if (current === myPlayerId) return null;
      return; // abort if not our claim
    });
    callbacks.onError?.(error.message || 'Failed to create game');
    isProcessingWageredMatch = false;
  }
}

/**
 * Retry helper for refund operations with exponential backoff.
 * Uses escrow-scoped idempotency key for safe retries.
 */
async function refundWithRetry(
  escrowId: string,
  maxRetries = 3
): Promise<{ success: boolean; error?: string }> {
  const idempotencyKey = `${escrowId}:refund`;  // Stable, escrow-scoped

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await refundEscrow({
        escrowId,
        reason: 'user_cancelled',
        idempotencyKey,
      });
      if (result.success) return { success: true };
      // Already processed is a success (idempotent)
      if (result.error?.includes('already')) return { success: true };
      console.error(`[refundWithRetry] Attempt ${attempt + 1} failed:`, result.error);
    } catch (err: any) {
      console.error(`[refundWithRetry] Attempt ${attempt + 1} threw:`, err);
    }
    // Exponential backoff before retry
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return { success: false, error: 'Refund failed after retries' };
}

/**
 * Leave wagered queue and refund escrow.
 * Returns { refundFailed: true } if refund failed after retries.
 */
export async function leaveWageredQueue(): Promise<{ refundFailed?: boolean }> {
  console.log('[leaveWageredQueue] Called with:', { currentEscrowId, myPlayerId });
  let refundFailed = false;

  // Refund escrow with retry if we have one
  if (currentEscrowId) {
    console.log('[leaveWageredQueue] Calling refundWithRetry for:', currentEscrowId);
    const result = await refundWithRetry(currentEscrowId);
    console.log('[leaveWageredQueue] refundWithRetry result:', result);
    if (!result.success) {
      console.error('[leaveWageredQueue] Refund failed after retries:', result.error);
      refundFailed = true;
    }
  } else {
    console.warn('[leaveWageredQueue] No currentEscrowId - cannot refund!');
  }

  // Safety net: clear any stale pending escrows (page refresh / crash recovery)
  if (myPlayerId) {
    try {
      await refundEscrow({
        escrowId: 'cleanup_pending',
        reason: 'cleanup_before_new_match',
        idempotencyKey: `${myPlayerId}:cleanup`,  // Stable key
      });
    } catch (err) {
      console.error('[leaveWageredQueue] Cleanup threw:', err);
    }
  }

  await cleanupWageredMatchmaking();
  return { refundFailed };
}

/**
 * Cleanup wagered matchmaking state
 */
async function cleanupWageredMatchmaking(): Promise<void> {
  isProcessingWageredMatch = false;

  if (wageredMatchmakingTimeout) {
    clearTimeout(wageredMatchmakingTimeout);
    wageredMatchmakingTimeout = null;
  }

  if (wageredQueueValueUnsubscribe) {
    wageredQueueValueUnsubscribe();
    wageredQueueValueUnsubscribe = null;
  }

  if (wageredEscrowGameIdUnsubscribe) {
    wageredEscrowGameIdUnsubscribe();
    wageredEscrowGameIdUnsubscribe = null;
  }

  if (wageredQueueOnDisconnect) {
    await wageredQueueOnDisconnect.cancel();
    wageredQueueOnDisconnect = null;
  }

  if (wageredQueueEntryRef) {
    await remove(wageredQueueEntryRef);
    wageredQueueEntryRef = null;
  }

  console.log('[cleanupWageredMatchmaking] Clearing currentEscrowId:', currentEscrowId);
  currentEscrowId = null;
  currentIdempotencyKey = null;
}

/**
 * Get current escrow ID (for settlement/forfeit)
 */
export function getCurrentEscrowId(): string | null {
  return currentEscrowId;
}
