/**
 * Firebase Utilities
 *
 * Helper functions for Firebase operations with retry logic
 * and error handling.
 */

/**
 * Retry a Firebase operation with exponential backoff
 * Useful for handling transient network errors
 */
export async function retryFirebaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on certain errors
      if (isNonRetryableError(lastError)) {
        throw lastError;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Check if an error should not be retried
 */
function isNonRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Authentication errors - won't be fixed by retrying
  if (message.includes('permission denied')) return true;
  if (message.includes('unauthorized')) return true;
  if (message.includes('unauthenticated')) return true;

  // Validation errors
  if (message.includes('invalid')) return true;

  return false;
}

/**
 * Generate a cryptographically secure random game ID
 * SECURITY: Always uses crypto.getRandomValues() - never Math.random()
 */
export function generateGameId(): string {
  // Use crypto.randomUUID if available (most modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Secure fallback using crypto.getRandomValues()
  // This is supported in all browsers that support Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // Last resort: throw error - we cannot generate secure IDs
  throw new Error('Crypto API not available - cannot generate secure game ID');
}

/**
 * Firebase path constants
 */
export const FIREBASE_PATHS = {
  USERS: 'users',
  PROFILES: 'profiles',
  WALLETS: 'wallets',
  PROGRESSION: 'progression',
  GAMES: 'games',
  MATCHMAKING_QUEUE: 'matchmaking_queue',
  CASUAL_QUEUE: 'matchmaking_queue/casual',
  WAGERED_QUEUE: 'matchmaking_queue/wagered',
  ESCROW: 'escrow',
  ACHIEVEMENTS: 'achievements',
  DAILY_CHALLENGES: 'daily_challenges',
  WEEKLY_CHALLENGES: 'weekly_challenges',
} as const;

/**
 * Build a Firebase path with segments
 */
export function buildFirebasePath(...segments: string[]): string {
  return segments.filter(Boolean).join('/');
}

/**
 * Sanitize a Firebase key (remove invalid characters)
 * Firebase keys cannot contain: . $ # [ ] /
 */
export function sanitizeFirebaseKey(key: string): string {
  return key.replace(/[.#$\[\]\/]/g, '_');
}

/**
 * Server timestamp placeholder for Firebase writes
 * Use this instead of Date.now() for consistent timestamps
 */
export const SERVER_TIMESTAMP = { '.sv': 'timestamp' };

/**
 * Create an atomic update object for Firebase
 * This ensures all updates happen together or not at all
 */
export function createAtomicUpdate(
  updates: Record<string, unknown>
): Record<string, unknown> {
  // Validate all paths
  for (const path of Object.keys(updates)) {
    if (path.includes('..') || path.startsWith('/')) {
      throw new Error(`Invalid path in atomic update: ${path}`);
    }
  }
  return updates;
}

/**
 * Heartbeat interval for online presence (ms)
 */
export const HEARTBEAT_INTERVAL = 5000;

/**
 * Time after which a player is considered disconnected (ms)
 */
export const DISCONNECT_THRESHOLD = 15000;

/**
 * Check if a player's heartbeat is still active
 */
export function isPlayerOnline(lastHeartbeat: number): boolean {
  return Date.now() - lastHeartbeat < DISCONNECT_THRESHOLD;
}

/**
 * Escrow status values
 */
export type EscrowStatus = 'pending' | 'locked' | 'settled' | 'refunded';

/**
 * Create escrow data structure
 */
export interface CreateEscrowParams {
  player1Id: string;
  player2Id: string;
  amount: number;
}

export function createEscrowData(params: CreateEscrowParams) {
  return {
    id: generateGameId(),
    player1Id: params.player1Id,
    player2Id: params.player2Id,
    amount: params.amount,
    status: 'pending' as EscrowStatus,
    createdAt: Date.now(),
  };
}
