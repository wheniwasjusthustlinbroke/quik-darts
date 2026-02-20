/**
 * Reconcile Stuck States (V1 - Detection Only)
 *
 * Scheduled job that DETECTS stuck money-path states and writes reports.
 * Does NOT perform auto-recovery in V1 - just provides visibility.
 *
 * Detects stuck states in:
 * - Escrows stuck in 'settling' (settlement crashed mid-way)
 * - Escrows stuck in 'refunding' (refund crashed mid-way) - HYBRID detection
 * - Escrows stuck in createGame 'processing' (game creation crashed)
 * - Stripe fulfillments stuck in 'processing' (webhook crashed)
 * - Ad rewards stuck in 'processing' (claim crashed)
 *
 * Query strategy:
 * - Escrow settling/createGame: timestamp-first (timestamps cleared on finalize)
 * - Escrow refunding: HYBRID (timestamp-first + status-first anomalies, deduped)
 * - Fulfillments/AdRewards: status-first (terminal records keep timestamps)
 *
 * Writes report to /reconciliation/runs/{timestamp}
 * Prunes reports older than 7 days
 *
 * NOTE: V1 queries canonical nodes directly. This is not scalable at 100k+ records.
 *       V2 should use an inflight index (/ops/moneyInflight/**) for bounded queries.
 *
 * Future V2 will add opt-in repair via existing idempotent helpers.
 *
 * RTDB INDEXES REQUIRED (add to database.rules.json):
 *   "escrow": { ".indexOn": ["status", "settlementStartedAt", "refundStartedAt", "createGameStartedAt"] }
 *   "stripeFulfillments": { ".indexOn": ["status"] }
 *   "verifiedAdRewards": { ".indexOn": ["status"] }
 */
import * as functions from 'firebase-functions';
/**
 * Scheduled reconciliation job - runs every 15 minutes
 * V1: Detection only - no mutations to money-path data
 */
export declare const reconcileStuckStates: functions.CloudFunction<unknown>;
