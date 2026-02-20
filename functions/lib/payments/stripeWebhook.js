"use strict";
/**
 * Stripe Webhook Handler
 *
 * Receives webhooks from Stripe for payment events.
 * Awards coins when checkout.session.completed is received.
 *
 * Security:
 * - Verifies Stripe webhook signature
 * - Prevents replay attacks with atomic fulfillment check + record
 * - Uses atomic transactions for coin awards
 * - Failed fulfillments are marked (not deleted) to prevent double-award on retry
 *
 * Setup: Configure webhook in Stripe Dashboard → Developers → Webhooks
 * URL: https://europe-west1-quikdarts.cloudfunctions.net/stripeWebhook
 * Events: checkout.session.completed
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = exports.COIN_PACKAGES = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const node_crypto_1 = require("node:crypto");
const paymentConstants_1 = require("./paymentConstants");
const db = admin.database();
// Lazy initialization - Stripe is created on first use
let stripe = null;
function getStripe() {
    if (!stripe) {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY not configured');
        }
        stripe = new stripe_1.default(secretKey, {
            apiVersion: '2025-12-15.clover',
        });
    }
    return stripe;
}
// Coin packages (must match createStripeCheckout.ts)
exports.COIN_PACKAGES = {
    'starter': { coins: 500 },
    'popular': { coins: 1200 },
    'best_value': { coins: 3500 },
    'pro': { coins: 8000 },
    'champion': { coins: 20000 },
};
exports.stripeWebhook = functions
    .runWith({
    secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
})
    .region('europe-west1')
    .https.onRequest(async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    // Get the webhook signature
    const signature = req.headers['stripe-signature'];
    if (!signature) {
        console.error('[stripeWebhook] Missing stripe-signature header');
        res.status(400).send('Missing signature');
        return;
    }
    // Get webhook secret from environment (trim any whitespace/newlines)
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
        console.error('[stripeWebhook] STRIPE_WEBHOOK_SECRET not configured');
        res.status(500).send('Webhook not configured');
        return;
    }
    let event;
    // Get the raw body (Firebase provides req.rawBody for signature verification)
    const rawBody = req.rawBody || req.body;
    try {
        // Verify the webhook signature
        event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
    }
    catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        console.error(`[stripeWebhook] Signature verification failed: ${errMessage}`);
        res.status(400).send('Invalid signature');
        return;
    }
    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        await handleSuccessfulPayment(session, event.id);
    }
    // Return 200 to acknowledge receipt
    res.status(200).json({ received: true });
});
/**
 * Handle successful payment - award coins to user
 *
 * Two-phase fulfillment with stale lock takeover:
 * 1. Acquire fulfillment lock (new/stale/failed → processing)
 * 2. Credit wallet with idempotency marker
 * 3. Finalize fulfillment (owner-guarded)
 *
 * Security:
 * - Amount locked at creation, reused on retry (config changes don't affect in-flight)
 * - Wallet marker keyed by paymentIntentId (stable across session retries)
 * - Owner-guarded state transitions prevent stale overwrites
 * - Throws on transient failures to trigger Stripe retry (non-2xx)
 */
async function handleSuccessfulPayment(session, eventId) {
    const sessionId = session.id;
    const userId = session.metadata?.userId;
    const packageId = session.metadata?.packageId;
    // Extract paymentIntentId for stronger deduplication
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
    const markerKey = paymentIntentId ?? sessionId;
    // Validate metadata (non-retriable - return 200 to stop pointless retries)
    if (!userId || !packageId) {
        console.error(`[stripeWebhook] Missing metadata in session ${sessionId}`);
        return;
    }
    // SECURITY: Block RTDB-unsafe characters only (Firebase UIDs vary in format)
    if (userId.length > 128 || /[.#$\[\]\/]/.test(userId)) {
        console.error(`[stripeWebhook] Invalid userId format in session ${sessionId}`);
        return;
    }
    // SECURITY: Verify payment is actually paid (critical for async payment methods)
    if (session.payment_status !== 'paid') {
        console.log(`[stripeWebhook] Session ${sessionId} not paid (status=${session.payment_status}); skipping`);
        return;
    }
    // SECURITY: Server-side coin lookup - FAIL CLOSED on unknown package
    const packageDef = exports.COIN_PACKAGES[packageId];
    if (!packageDef) {
        console.error(`[stripeWebhook] Unknown packageId: ${packageId} - rejecting session ${sessionId}`);
        return;
    }
    const coinsToAward = packageDef.coins;
    const now = Date.now();
    const requestId = `stripe_${(0, node_crypto_1.randomUUID)()}`;
    const fulfillmentRef = db.ref(`stripeFulfillments/${sessionId}`);
    // Phase 1: Acquire fulfillment lock with stale takeover
    const fulfillmentResult = await fulfillmentRef.transaction((existing) => {
        if (!existing) {
            // New fulfillment - acquire lock and LOCK the amount
            return {
                userId,
                packageId,
                coinsToAward, // Locked at creation - never changes on retry
                amountPaid: session.amount_total,
                currency: session.currency,
                paymentIntentId,
                markerKey,
                eventId,
                status: 'processing',
                requestId,
                startedAt: now,
            };
        }
        const status = existing.status;
        if (status === 'completed') {
            return; // Abort - already done (idempotent)
        }
        if (status === 'processing') {
            const lockAge = now - (existing.startedAt || 0);
            if (lockAge < paymentConstants_1.FULFILLMENT_LOCK_TIMEOUT_MS) {
                return; // Abort - still being processed (will throw below)
            }
            // Stale lock - allow takeover (log moved outside tx callback)
        }
        // Failed status - allow retry (log moved outside tx callback)
        // Acquire lock - do NOT overwrite coinsToAward/userId (use stored values)
        return {
            ...existing,
            eventId,
            status: 'processing',
            requestId,
            startedAt: now,
            retryCount: (existing.retryCount || 0) + 1,
            lastError: existing.error,
            error: null,
        };
    });
    const fulfillmentAfterLock = fulfillmentResult.snapshot.val();
    // Check if WE acquired the lock
    if (!fulfillmentResult.committed || fulfillmentAfterLock?.requestId !== requestId) {
        const status = fulfillmentAfterLock?.status;
        if (status === 'completed') {
            console.log(`[stripeWebhook] Session ${sessionId} already fulfilled (idempotent)`);
            return;
        }
        // CRITICAL: Do NOT return 200 - force Stripe to retry
        if (status === 'processing') {
            throw new functions.https.HttpsError('aborted', `Fulfillment in progress for session ${sessionId}`);
        }
        throw new functions.https.HttpsError('aborted', `Fulfillment lock not acquired for session ${sessionId}`);
    }
    // Log retry after transaction (NOT inside callback which may run multiple times)
    const retryCount = typeof fulfillmentAfterLock.retryCount === 'number'
        ? fulfillmentAfterLock.retryCount
        : 0;
    if (retryCount > 0) {
        console.log(`[stripeWebhook] Retrying fulfillment for ${sessionId} (retry #${retryCount}) requestId=${requestId}`);
    }
    // SECURITY: Use locked values from fulfillment record (not current config/metadata)
    // Backward-compat: existing fulfillments may lack coinsToAward - fallback to current config
    const lockedUserId = fulfillmentAfterLock.userId;
    const hasLockedCoins = typeof fulfillmentAfterLock.coinsToAward === 'number';
    const lockedCoins = hasLockedCoins ? fulfillmentAfterLock.coinsToAward : coinsToAward;
    if (!hasLockedCoins) {
        console.warn(`[stripeWebhook] Legacy fulfillment missing coinsToAward; fallback used for ${sessionId}`);
    }
    const lockedMarkerKey = fulfillmentAfterLock.markerKey ?? markerKey;
    // SECURITY: Verify packageId matches - data integrity issue, not retriable
    if (fulfillmentAfterLock.packageId !== packageId) {
        console.error(`[stripeWebhook] PackageId mismatch for session ${sessionId}: expected=${fulfillmentAfterLock.packageId}, received=${packageId}`);
        await fulfillmentRef.transaction((f) => {
            if (!f || f.status !== 'processing' || f.requestId !== requestId)
                return;
            return {
                ...f,
                status: 'failed',
                error: `package_mismatch_${requestId}`,
                expectedPackageId: f.packageId,
                receivedPackageId: packageId,
                failedAt: now,
                requestId: null,
            };
        });
        return; // Return 200 to stop pointless Stripe retries
    }
    // Phase 2: Award coins with idempotency marker
    const walletRef = db.ref(`users/${lockedUserId}/wallet`);
    const walletResult = await walletRef.transaction((wallet) => {
        if (wallet == null) {
            // Create wallet with marker (valid for purchases before full init)
            return {
                coins: lockedCoins,
                lifetimeEarnings: lockedCoins,
                lifetimeSpent: 0,
                lastDailyBonus: 0,
                lastAdReward: 0,
                adRewardsToday: 0,
                version: 1,
                purchaseMarkers: {
                    [lockedMarkerKey]: { requestId, ts: now, amount: lockedCoins },
                },
            };
        }
        // Idempotency: check if already credited
        if (wallet.purchaseMarkers?.[lockedMarkerKey]) {
            return; // Abort - already applied
        }
        return {
            ...wallet,
            coins: (wallet.coins || 0) + lockedCoins,
            lifetimeEarnings: (wallet.lifetimeEarnings || 0) + lockedCoins,
            version: (wallet.version || 0) + 1,
            purchaseMarkers: {
                ...(wallet.purchaseMarkers || {}),
                [lockedMarkerKey]: { requestId, ts: now, amount: lockedCoins },
            },
        };
    });
    let weAppliedCredit = walletResult.committed;
    if (!walletResult.committed) {
        // Check if marker exists (idempotent success)
        let markerSnap;
        try {
            markerSnap = await walletRef.child(`purchaseMarkers/${lockedMarkerKey}`).once('value');
        }
        catch (e) {
            console.error(`[stripeWebhook] Marker read failed for ${lockedUserId}, key: ${lockedMarkerKey}:`, e);
            // Owner-guarded failure update
            await fulfillmentRef.transaction((f) => {
                if (!f || f.status !== 'processing' || f.requestId !== requestId)
                    return;
                return { ...f, status: 'failed', error: `marker_check_failed_${requestId}`, failedAt: now, requestId: null };
            });
            throw new functions.https.HttpsError('unavailable', 'Temporary fulfillment failure; retrying');
        }
        if (!markerSnap.exists()) {
            console.error(`[stripeWebhook] Wallet credit failed for ${lockedUserId}`);
            // Owner-guarded failure update
            await fulfillmentRef.transaction((f) => {
                if (!f || f.status !== 'processing' || f.requestId !== requestId)
                    return;
                return { ...f, status: 'failed', error: `wallet_failed_${requestId}`, failedAt: now, requestId: null };
            });
            throw new functions.https.HttpsError('unavailable', 'Temporary fulfillment failure; retrying');
        }
        console.log(`[stripeWebhook] Already credited (marker present) key=${lockedMarkerKey}`);
    }
    // Phase 3: Owner-guarded completion
    const finalizeResult = await fulfillmentRef.transaction((f) => {
        if (!f || f.status !== 'processing' || f.requestId !== requestId)
            return;
        return {
            ...f,
            status: 'completed',
            coinsAwarded: lockedCoins,
            fulfilledAt: now,
            requestId: null,
            error: null,
        };
    });
    // Check finalization committed - if not, verify status before returning 200
    if (!finalizeResult.committed) {
        const latest = (await fulfillmentRef.once('value')).val();
        if (latest?.status !== 'completed') {
            console.warn(`[stripeWebhook] Finalization not committed; status=${latest?.status} session=${sessionId} requestId=${requestId}`);
            throw new functions.https.HttpsError('aborted', `Finalization incomplete for session ${sessionId}`);
        }
        // Another process completed it - idempotent success
        console.log(`[stripeWebhook] Finalization completed by another process for ${sessionId}`);
    }
    // Log transaction ONLY if WE applied credit
    if (weAppliedCredit) {
        const newBalance = walletResult.snapshot.val()?.coins || 0;
        try {
            await db.ref(`users/${lockedUserId}/transactions`).push({
                type: 'purchase',
                amount: lockedCoins,
                description: `Purchased ${packageId} pack`,
                timestamp: now,
                balanceAfter: newBalance,
                stripeSessionId: sessionId,
                stripeEventId: eventId,
                paymentIntentId,
            });
        }
        catch (e) {
            console.error(`[stripeWebhook] WARN - transaction log failed for ${lockedUserId}:`, e);
        }
    }
    console.log(`[stripeWebhook] Coins awarded successfully for session ${sessionId}`);
}
//# sourceMappingURL=stripeWebhook.js.map