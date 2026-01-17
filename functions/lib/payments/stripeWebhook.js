"use strict";
/**
 * Stripe Webhook Handler
 *
 * Receives webhooks from Stripe for payment events.
 * Awards coins when checkout.session.completed is received.
 *
 * Security:
 * - Verifies Stripe webhook signature
 * - Prevents replay attacks by storing processed session IDs
 * - Uses atomic transactions for coin awards
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
exports.stripeWebhook = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
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
const COIN_PACKAGES = {
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
    // Get the raw body - try multiple methods
    let rawBody;
    if (req.rawBody) {
        rawBody = req.rawBody;
    }
    else if (typeof req.body === 'string') {
        rawBody = req.body;
    }
    else {
        rawBody = JSON.stringify(req.body);
    }
    // Debug logging
    console.log(`[stripeWebhook] Body source: ${req.rawBody ? 'rawBody' : 'body'}`);
    console.log(`[stripeWebhook] Body type: ${typeof rawBody}, length: ${rawBody?.length || 0}`);
    console.log(`[stripeWebhook] Signature type: ${typeof signature}`);
    console.log(`[stripeWebhook] Secret starts: ${webhookSecret.substring(0, 10)}...`);
    try {
        // Verify the webhook signature using rawBody
        event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
    }
    catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        console.error(`[stripeWebhook] Signature failed: ${errMessage}`);
        // Log more details for debugging
        if (typeof rawBody === 'string') {
            console.log(`[stripeWebhook] Body preview: ${rawBody.substring(0, 100)}...`);
        }
        res.status(400).send('Invalid signature');
        return;
    }
    console.log(`[stripeWebhook] Received event type: ${event.type}`);
    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log(`[stripeWebhook] Session ID: ${session.id}, metadata:`, JSON.stringify(session.metadata));
        await handleSuccessfulPayment(session);
    }
    else {
        console.log(`[stripeWebhook] Unhandled event type: ${event.type}`);
    }
    // Return 200 to acknowledge receipt
    res.status(200).json({ received: true });
});
/**
 * Handle successful payment - award coins to user
 */
async function handleSuccessfulPayment(session) {
    const sessionId = session.id;
    const userId = session.metadata?.userId;
    const packageId = session.metadata?.packageId;
    const coinsFromMeta = session.metadata?.coins;
    // Validate metadata
    if (!userId || !packageId) {
        console.error(`[stripeWebhook] Missing metadata in session ${sessionId}`);
        return;
    }
    // Validate userId format
    if (!/^[a-zA-Z0-9]{20,128}$/.test(userId)) {
        console.error(`[stripeWebhook] Invalid userId format: ${userId}`);
        return;
    }
    // Get coins from package (prefer package definition over metadata for security)
    const packageDef = COIN_PACKAGES[packageId];
    const coinsToAward = packageDef?.coins || parseInt(coinsFromMeta || '0', 10);
    if (!coinsToAward || coinsToAward <= 0) {
        console.error(`[stripeWebhook] Invalid coins amount for package ${packageId}`);
        return;
    }
    // Check for duplicate fulfillment
    const fulfillmentRef = db.ref(`stripeFulfillments/${sessionId}`);
    const existingFulfillment = await fulfillmentRef.once('value');
    if (existingFulfillment.exists()) {
        console.log(`[stripeWebhook] Session ${sessionId} already fulfilled`);
        return;
    }
    // Award coins with atomic transaction
    const now = Date.now();
    const walletRef = db.ref(`users/${userId}/wallet`);
    const transactionsRef = db.ref(`users/${userId}/transactions`);
    const result = await walletRef.transaction((wallet) => {
        if (wallet === null) {
            // User wallet doesn't exist - this shouldn't happen for logged-in users
            // Create a basic wallet structure
            return {
                coins: coinsToAward,
                lifetimeEarnings: coinsToAward,
                lifetimeSpent: 0,
                lastDailyBonus: 0,
                lastAdReward: 0,
                adRewardsToday: 0,
                version: 1,
            };
        }
        return {
            ...wallet,
            coins: (wallet.coins || 0) + coinsToAward,
            lifetimeEarnings: (wallet.lifetimeEarnings || 0) + coinsToAward,
            version: (wallet.version || 0) + 1,
        };
    });
    if (!result.committed) {
        console.error(`[stripeWebhook] Failed to award coins for session ${sessionId}`);
        return;
    }
    // Record fulfillment to prevent duplicates
    await fulfillmentRef.set({
        userId,
        packageId,
        coinsAwarded: coinsToAward,
        amountPaid: session.amount_total,
        currency: session.currency,
        fulfilledAt: now,
    });
    // Log transaction
    const newBalance = result.snapshot.val()?.coins || 0;
    await transactionsRef.child(`purchase_${now}`).set({
        type: 'purchase',
        amount: coinsToAward,
        description: `Purchased ${packageId} pack`,
        timestamp: now,
        balanceAfter: newBalance,
        stripeSessionId: sessionId,
    });
    console.log(`[stripeWebhook] Awarded ${coinsToAward} coins to user ${userId} for session ${sessionId}`);
}
//# sourceMappingURL=stripeWebhook.js.map