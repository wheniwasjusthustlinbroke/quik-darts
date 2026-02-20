"use strict";
/**
 * Payment Constants
 *
 * Shared constants for payment/fulfillment operations.
 * IMPORTANT: These values affect money-path behavior across payment files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FULFILLMENT_LOCK_TIMEOUT_MS = void 0;
// Stale fulfillment processing can be retried after this duration (2 minutes)
// Used by: stripeWebhook.ts
exports.FULFILLMENT_LOCK_TIMEOUT_MS = 120000;
//# sourceMappingURL=paymentConstants.js.map