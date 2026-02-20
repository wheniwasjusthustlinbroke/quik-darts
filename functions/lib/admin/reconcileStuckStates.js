"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileStuckStates = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const settlementConstants_1 = require("../wagering/settlementConstants");
const paymentConstants_1 = require("../payments/paymentConstants");
const db = admin.database();
// Refund stale timeout (matches refundEscrow.ts)
const REFUND_STALE_MS = 60000;
// Ad reward lock timeout (matches claimAdReward.ts)
const AD_REWARD_LOCK_TIMEOUT_MS = 120000;
// Batch limit to prevent large scans (temporary V1 limitation)
const BATCH_LIMIT = 200;
// Add buffer to ensure we only flag truly stale records
const STALE_BUFFER_MS = 10000;
// Report retention: 7 days
const REPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Scheduled reconciliation job - runs every 15 minutes
 * V1: Detection only - no mutations to money-path data
 */
exports.reconcileStuckStates = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 120 })
    .pubsub.schedule('every 15 minutes')
    .timeZone('Europe/London')
    .onRun(async () => {
    const now = Date.now();
    const errors = [];
    console.log('[reconcileStuckStates] Starting detection run (dry-run mode, v1-canonical-queries)');
    // Escrow settling: timestamp-first (timestamps cleared on finalize)
    const stuckSettling = await safeDetect(() => findStuckByTimestamp('escrow', 'settlementStartedAt', 'status', 'settling', settlementConstants_1.SETTLEMENT_LOCK_TIMEOUT_MS + STALE_BUFFER_MS, now), 'settling', errors);
    // Escrow createGame: timestamp-first (timestamps cleared on finalize)
    const stuckCreateGame = await safeDetect(() => findStuckByTimestamp('escrow', 'createGameStartedAt', 'createGameStatus', 'processing', settlementConstants_1.CREATE_GAME_LOCK_TIMEOUT_MS + STALE_BUFFER_MS, now), 'createGame', errors);
    // Escrow refunding: HYBRID (timestamp-first + status-first anomalies, deduped)
    // This catches both stale timestamped records AND missing-timestamp anomalies
    const stuckRefunding = await safeDetect(() => findStuckRefundingHybrid(REFUND_STALE_MS + STALE_BUFFER_MS, now), 'refunding', errors);
    // Fulfillments: status-first (terminal records keep timestamps)
    const stuckFulfillments = await safeDetect(() => findStuckByStatus('stripeFulfillments', 'status', 'processing', 'startedAt', paymentConstants_1.FULFILLMENT_LOCK_TIMEOUT_MS + STALE_BUFFER_MS, now), 'fulfillments', errors);
    // Ad rewards: status-first (terminal records keep timestamps)
    const stuckAdRewards = await safeDetect(() => findStuckByStatus('verifiedAdRewards', 'status', 'processing', 'processingStartedAt', AD_REWARD_LOCK_TIMEOUT_MS + STALE_BUFFER_MS, now), 'adRewards', errors);
    const totalStuck = stuckSettling.records.length +
        stuckRefunding.records.length +
        stuckCreateGame.records.length +
        stuckFulfillments.records.length +
        stuckAdRewards.records.length;
    const totalAnomalies = [
        ...stuckSettling.records,
        ...stuckRefunding.records,
        ...stuckCreateGame.records,
        ...stuckFulfillments.records,
        ...stuckAdRewards.records,
    ].filter(r => r.anomaly).length;
    const batchLimitHit = stuckSettling.limitHit ||
        stuckRefunding.limitHit ||
        stuckCreateGame.limitHit ||
        stuckFulfillments.limitHit ||
        stuckAdRewards.limitHit;
    // Write report (no mutations to actual money-path data)
    const report = {
        timestamp: now,
        dryRun: true,
        version: 'v1-canonical-queries',
        stuckSettling: stuckSettling.records,
        stuckRefunding: stuckRefunding.records,
        stuckCreateGame: stuckCreateGame.records,
        stuckFulfillments: stuckFulfillments.records,
        stuckAdRewards: stuckAdRewards.records,
        totalStuck,
        totalAnomalies,
        batchLimitHit,
        errors,
        thresholds: {
            settlement: settlementConstants_1.SETTLEMENT_LOCK_TIMEOUT_MS,
            refund: REFUND_STALE_MS,
            createGame: settlementConstants_1.CREATE_GAME_LOCK_TIMEOUT_MS,
            fulfillment: paymentConstants_1.FULFILLMENT_LOCK_TIMEOUT_MS,
            adReward: AD_REWARD_LOCK_TIMEOUT_MS,
        },
    };
    await db.ref(`reconciliation/runs/${now}`).set(report);
    // Log alerts
    if (totalStuck > 0) {
        console.error(`[reconcileStuckStates] ALERT: ${totalStuck} stuck records found (${totalAnomalies} anomalies). ` +
            `settling=${stuckSettling.records.length}, ` +
            `refunding=${stuckRefunding.records.length}, ` +
            `createGame=${stuckCreateGame.records.length}, ` +
            `fulfillments=${stuckFulfillments.records.length}, ` +
            `adRewards=${stuckAdRewards.records.length}`);
        // Log sample IDs for debugging (max 3 each)
        logSampleIds('settling', stuckSettling.records);
        logSampleIds('refunding', stuckRefunding.records);
        logSampleIds('createGame', stuckCreateGame.records);
        logSampleIds('fulfillments', stuckFulfillments.records);
        logSampleIds('adRewards', stuckAdRewards.records);
    }
    else {
        console.log('[reconcileStuckStates] No stuck records found');
    }
    if (totalAnomalies > 0) {
        console.error(`[reconcileStuckStates] CRITICAL: ${totalAnomalies} anomalies with missing timestamps - these will never self-recover!`);
    }
    if (batchLimitHit) {
        console.warn(`[reconcileStuckStates] Batch limit (${BATCH_LIMIT}) hit - more stuck records may exist`);
    }
    if (errors.length > 0) {
        console.error(`[reconcileStuckStates] Errors during detection: ${errors.join(', ')}`);
    }
    // Prune old reports (>7 days)
    await pruneOldReports(now);
    console.log(`[reconcileStuckStates] Detection complete. Report written to /reconciliation/runs/${now}`);
    return report;
});
/**
 * Wrap detection in try/catch for resilience
 * Partial results are still collected if some sources fail
 */
async function safeDetect(detectFn, sourceName, errors) {
    try {
        return await detectFn();
    }
    catch (e) {
        const msg = `${sourceName}: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[reconcileStuckStates] Detection failed for ${sourceName}:`, e);
        errors.push(msg);
        return { records: [], limitHit: false, error: msg };
    }
}
/**
 * HYBRID refund detection: timestamp-first + status-first anomalies, deduped.
 *
 * Why hybrid?
 * - Timestamp-first catches stale refunding with valid timestamps (oldest first)
 * - Status-first catches anomalies where refundStartedAt is missing/invalid
 * - Merge + dedupe ensures no double-reporting
 */
async function findStuckRefundingHybrid(staleThresholdMs, now) {
    // 1. Timestamp-first: find stale refunding with valid timestamps
    const staleResult = await findStuckByTimestamp('escrow', 'refundStartedAt', 'status', 'refunding', staleThresholdMs, now);
    // 2. Status-first: find anomalies (missing timestamps)
    const anomalyResult = await findMissingTimestampAnomalies('escrow', 'status', 'refunding', 'refundStartedAt');
    // 3. Merge + dedupe by id
    const seenIds = new Set();
    const merged = [];
    for (const record of staleResult.records) {
        if (!seenIds.has(record.id)) {
            seenIds.add(record.id);
            merged.push(record);
        }
    }
    for (const record of anomalyResult.records) {
        if (!seenIds.has(record.id)) {
            seenIds.add(record.id);
            merged.push(record);
        }
    }
    return {
        records: merged,
        limitHit: staleResult.limitHit || anomalyResult.limitHit,
    };
}
/**
 * Find stuck records by querying timestamp field, filtering status in-memory.
 * Best for: escrow settling/createGame where timestamps are cleared on finalize.
 *
 * Query: orderByChild(timestampField).startAt(1).endAt(staleThreshold)
 */
async function findStuckByTimestamp(nodePath, timestampField, statusField, targetStatus, staleThresholdMs, now) {
    const staleThreshold = now - staleThresholdMs;
    const snap = await db.ref(nodePath)
        .orderByChild(timestampField)
        .startAt(1)
        .endAt(staleThreshold)
        .limitToFirst(BATCH_LIMIT)
        .once('value');
    const data = snap.val();
    if (!data) {
        return { records: [], limitHit: false };
    }
    const records = [];
    for (const [id, entry] of Object.entries(data)) {
        const lockedAt = entry[timestampField];
        // Timestamp sanity check (redundant with startAt(1) but defensive)
        if (typeof lockedAt !== 'number' || lockedAt <= 0) {
            continue;
        }
        // Filter by status in-memory
        if (entry[statusField] !== targetStatus) {
            continue;
        }
        records.push({
            id,
            lockedAt,
            requestId: entry.settlementRequestId || entry.refundRequestId || entry.requestId || entry.processingRequestId,
            ageMs: now - lockedAt,
            owner: entry.winnerId || entry.userId,
        });
    }
    return {
        records,
        limitHit: Object.keys(data).length >= BATCH_LIMIT,
    };
}
/**
 * Find anomalies: records with target status but missing/invalid timestamps.
 * These are the most dangerous stuck records - they will never self-recover via stale takeover.
 */
async function findMissingTimestampAnomalies(nodePath, statusField, targetStatus, timestampField) {
    const snap = await db.ref(nodePath)
        .orderByChild(statusField)
        .equalTo(targetStatus)
        .limitToFirst(BATCH_LIMIT)
        .once('value');
    const data = snap.val();
    if (!data) {
        return { records: [], limitHit: false };
    }
    const records = [];
    for (const [id, entry] of Object.entries(data)) {
        const lockedAt = entry[timestampField];
        // Only include records with missing/invalid timestamps
        const hasValidTimestamp = typeof lockedAt === 'number' && lockedAt > 0;
        if (hasValidTimestamp) {
            continue; // Skip valid timestamps - handled by timestamp-first query
        }
        records.push({
            id,
            lockedAt: 0,
            requestId: entry.refundRequestId || entry.requestId || entry.processingRequestId,
            ageMs: -1, // Unknown age
            owner: entry.userId,
            anomaly: true,
        });
    }
    return {
        records,
        limitHit: Object.keys(data).length >= BATCH_LIMIT,
    };
}
/**
 * Find stuck records by querying status field, filtering timestamp in-memory.
 * Best for: fulfillments/ad rewards where terminal records keep timestamps.
 *
 * Query: orderByChild(statusField).equalTo(targetStatus).limitToFirst(BATCH_LIMIT)
 * Reports records with missing timestamps as anomalies.
 */
async function findStuckByStatus(nodePath, statusField, targetStatus, timestampField, staleThresholdMs, now) {
    const staleThreshold = now - staleThresholdMs;
    const snap = await db.ref(nodePath)
        .orderByChild(statusField)
        .equalTo(targetStatus)
        .limitToFirst(BATCH_LIMIT)
        .once('value');
    const data = snap.val();
    if (!data) {
        return { records: [], limitHit: false };
    }
    const records = [];
    for (const [id, entry] of Object.entries(data)) {
        const lockedAt = entry[timestampField];
        // Check if timestamp is missing/invalid
        const hasValidTimestamp = typeof lockedAt === 'number' && lockedAt > 0;
        if (!hasValidTimestamp) {
            // Missing timestamp - this is an anomaly (will never self-recover)
            records.push({
                id,
                lockedAt: 0,
                requestId: entry.requestId || entry.processingRequestId,
                ageMs: -1, // Unknown age
                owner: entry.userId,
                anomaly: true,
            });
            continue;
        }
        // Filter by stale threshold in-memory
        if (lockedAt > staleThreshold) {
            continue; // Not stale yet
        }
        records.push({
            id,
            lockedAt,
            requestId: entry.requestId || entry.processingRequestId,
            ageMs: now - lockedAt,
            owner: entry.userId,
        });
    }
    return {
        records,
        limitHit: Object.keys(data).length >= BATCH_LIMIT,
    };
}
/**
 * Log sample IDs for debugging
 */
function logSampleIds(type, records) {
    if (records.length === 0)
        return;
    const sampleIds = records.slice(0, 3).map(r => {
        const ageStr = r.anomaly ? 'ANOMALY' : `age: ${Math.round(r.ageMs / 1000)}s`;
        return `${r.id} (${ageStr})`;
    });
    console.error(`[reconcileStuckStates] Sample stuck ${type}: ${sampleIds.join(', ')}`);
}
/**
 * Prune old reconciliation reports (>7 days)
 * Uses bounded delete to prevent unbounded operations
 */
async function pruneOldReports(now) {
    const cutoff = now - REPORT_RETENTION_MS;
    const cutoffKey = String(cutoff);
    try {
        // Query old reports (keys are timestamps)
        const oldReportsSnap = await db.ref('reconciliation/runs')
            .orderByKey()
            .endAt(cutoffKey)
            .limitToFirst(50) // Bounded delete
            .once('value');
        const oldReports = oldReportsSnap.val();
        if (!oldReports)
            return;
        const keysToDelete = Object.keys(oldReports);
        if (keysToDelete.length === 0)
            return;
        // Delete old reports
        const updates = {};
        for (const key of keysToDelete) {
            updates[`reconciliation/runs/${key}`] = null;
        }
        await db.ref().update(updates);
        console.log(`[reconcileStuckStates] Pruned ${keysToDelete.length} old reports`);
    }
    catch (e) {
        console.error('[reconcileStuckStates] Failed to prune old reports:', e);
        // Non-fatal - continue
    }
}
//# sourceMappingURL=reconcileStuckStates.js.map