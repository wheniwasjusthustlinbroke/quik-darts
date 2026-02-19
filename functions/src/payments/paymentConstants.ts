/**
 * Payment Constants
 *
 * Shared constants for payment/fulfillment operations.
 * IMPORTANT: These values affect money-path behavior across payment files.
 */

// Stale fulfillment processing can be retried after this duration (2 minutes)
// Used by: stripeWebhook.ts
export const FULFILLMENT_LOCK_TIMEOUT_MS = 120_000 as const;
