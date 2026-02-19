/**
 * Escrow / Money-Path Lock Constants
 *
 * Shared constants for escrow lock timeouts across money-path operations.
 * IMPORTANT: These values affect money-path behavior across multiple files.
 */

// Stale locks can be retried after this duration (2 minutes)
// Used by: settleGame.ts, forfeitGame.ts
export const SETTLEMENT_LOCK_TIMEOUT_MS = 120_000 as const;

// Stale create-game locks can be retried after this duration (2 minutes)
// Used by: createGame.ts
export const CREATE_GAME_LOCK_TIMEOUT_MS = 120_000 as const;
