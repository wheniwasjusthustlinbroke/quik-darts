/**
 * Emulator Test Setup
 *
 * Provides shared helpers for integration tests running against
 * the Firebase RTDB emulator. Env vars are set by jest.integration.setup.ts
 * (via Jest setupFiles) before this module is loaded.
 *
 * Import this FIRST in integration test files, before any source imports.
 */

import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';

// Initialize admin SDK once — guard prevents "app already exists" when
// multiple test files import this module in the same Jest process.
if (!admin.apps.length) {
  const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  admin.initializeApp({
    projectId: 'quikdarts',
    // Keep explicit DB URL for correct namespace routing in emulator
    databaseURL: host ? `http://${host}/?ns=quikdarts` : undefined,
  });
}

// Initialize firebase-functions-test in online mode.
export const testEnv = functionsTest({ projectId: 'quikdarts' });

// Database reference connected to the emulator.
export const db = admin.database();

// ---------------------------------------------------------------------------
// RTDB Path Constants — derived from source code db.ref() calls.
// Centralised here so tests never hard-code path strings.
// ---------------------------------------------------------------------------

export const PATHS = {
  // User data (createEscrow, settleGame, refundEscrow, stripeWebhook)
  wallet: (userId: string) => `users/${userId}/wallet`,
  transactions: (userId: string) => `users/${userId}/transactions`,
  progression: (userId: string) => `users/${userId}/progression`,
  streaks: (userId: string) => `users/${userId}/streaks`,

  // Escrow (createEscrow, settleGame, refundEscrow)
  escrow: (escrowId: string) => `escrow/${escrowId}`,
  escrowRoot: 'escrow',

  // Games (settleGame, submitThrow, forfeitGame, createGame)
  game: (gameId: string) => `games/${gameId}`,
  gameSettled: (gameId: string) => `games/${gameId}/wager/settled`,

  // Rate limiting (createEscrow)
  escrowRateLimit: (userId: string) => `escrowRateLimits/${userId}`,

  // Stripe fulfillment (stripeWebhook)
  fulfillment: (sessionId: string) => `stripeFulfillments/${sessionId}`,

  // Matchmaking queue (refundEscrow, createGame)
  wageredQueue: (stakeLevel: number, userId: string) =>
    `matchmaking_queue/wagered/${stakeLevel}/${userId}`,
};

// ---------------------------------------------------------------------------
// Seed / Read / Clear helpers
// ---------------------------------------------------------------------------

/** Wipe all data in the emulator database. Call in beforeEach(). */
export async function clearDatabase(): Promise<void> {
  await db.ref().remove();
}

/** Seed a user wallet at users/{userId}/wallet. */
export async function seedUser(
  userId: string,
  wallet: {
    coins: number;
    lifetimeEarnings?: number;
    lifetimeSpent?: number;
    version?: number;
  },
): Promise<void> {
  await db.ref(PATHS.wallet(userId)).set({
    coins: wallet.coins,
    lifetimeEarnings: wallet.lifetimeEarnings ?? 0,
    lifetimeSpent: wallet.lifetimeSpent ?? 0,
    lastDailyBonus: 0,
    lastAdReward: 0,
    adRewardsToday: 0,
    version: wallet.version ?? 1,
  });
}

/** Seed an escrow record at escrow/{escrowId}. */
export async function seedEscrow(
  escrowId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.ref(PATHS.escrow(escrowId)).set(data);
}

/** Seed a game record at games/{gameId}. */
export async function seedGame(
  gameId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.ref(PATHS.game(gameId)).set(data);
}

/** Seed user progression at users/{userId}/progression. */
export async function seedProgression(
  userId: string,
  data: { xp?: number; level?: number; gamesPlayed?: number; gamesWon?: number },
): Promise<void> {
  await db.ref(PATHS.progression(userId)).set({
    xp: data.xp ?? 0,
    level: data.level ?? 1,
    gamesPlayed: data.gamesPlayed ?? 0,
    gamesWon: data.gamesWon ?? 0,
  });
}

/** Read any RTDB path and return its value (null if absent). */
export async function readPath<T = unknown>(path: string): Promise<T | null> {
  const snap = await db.ref(path).once('value');
  return snap.val() as T | null;
}

// ---------------------------------------------------------------------------
// Auth context helpers for wrapped onCall functions
// ---------------------------------------------------------------------------

/** Build an auth context object for testEnv.wrap() calls. */
export function authContext(
  userId: string,
  options?: { anonymous?: boolean },
) {
  return {
    auth: {
      uid: userId,
      token: {
        firebase: {
          sign_in_provider: options?.anonymous ? 'anonymous' : 'google.com',
        },
      },
    },
  };
}
