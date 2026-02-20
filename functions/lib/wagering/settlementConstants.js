"use strict";
/**
 * Escrow / Money-Path Lock Constants
 *
 * Shared constants for escrow lock timeouts across money-path operations.
 * IMPORTANT: These values affect money-path behavior across multiple files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREATE_GAME_LOCK_TIMEOUT_MS = exports.SETTLEMENT_LOCK_TIMEOUT_MS = void 0;
// Stale locks can be retried after this duration (2 minutes)
// Used by: settleGame.ts, forfeitGame.ts
exports.SETTLEMENT_LOCK_TIMEOUT_MS = 120000;
// Stale create-game locks can be retried after this duration (2 minutes)
// Used by: createGame.ts
exports.CREATE_GAME_LOCK_TIMEOUT_MS = 120000;
//# sourceMappingURL=settlementConstants.js.map