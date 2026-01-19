"use strict";
/**
 * Create Stripe Checkout Session
 *
 * Creates a Stripe Checkout session for purchasing coin packages.
 * Redirects user to Stripe-hosted payment page.
 *
 * Security:
 * - Requires authentication (non-anonymous)
 * - Validates product/price selection
 * - Stores userId in metadata for fulfillment
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
exports.createStripeCheckout = void 0;
const functions = __importStar(require("firebase-functions"));
const stripe_1 = __importDefault(require("stripe"));
// Lazy initialization - Stripe is created on first use
// This is required because secrets aren't available at module load time
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
// Coin packages with prices (in cents)
// These should match products created in Stripe Dashboard
const COIN_PACKAGES = {
    'starter': { coins: 500, priceUsd: 99, name: 'Starter Pack' },
    'popular': { coins: 1200, priceUsd: 199, name: 'Popular Pack' },
    'best_value': { coins: 3500, priceUsd: 499, name: 'Best Value Pack' },
    'pro': { coins: 8000, priceUsd: 999, name: 'Pro Pack' },
    'champion': { coins: 20000, priceUsd: 1999, name: 'Champion Pack' },
};
exports.createStripeCheckout = functions
    .runWith({
    secrets: ['STRIPE_SECRET_KEY'],
})
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in to purchase coins');
    }
    const userId = context.auth.uid;
    const token = context.auth.token;
    // 2. Must NOT be anonymous
    if (token.firebase?.sign_in_provider === 'anonymous') {
        throw new functions.https.HttpsError('permission-denied', 'Sign in with Google, Facebook, or Apple to purchase coins');
    }
    // 3. Validate package selection
    const { packageId, successUrl, cancelUrl } = data;
    if (!packageId || typeof packageId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid package selection');
    }
    const selectedPackage = COIN_PACKAGES[packageId];
    if (!selectedPackage) {
        throw new functions.https.HttpsError('invalid-argument', 'Unknown package. Please select a valid coin package.');
    }
    // 4. Validate URLs (basic check)
    if (!successUrl || !cancelUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing redirect URLs');
    }
    // Validate URLs are from allowed domains (production only)
    const allowedDomains = ['quikdarts.com', 'quikdarts.web.app'];
    const isValidUrl = (url) => {
        try {
            const parsed = new URL(url);
            return allowedDomains.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain));
        }
        catch {
            return false;
        }
    };
    if (!isValidUrl(successUrl) || !isValidUrl(cancelUrl)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid redirect URLs');
    }
    try {
        // 5. Create Stripe Checkout session
        const session = await getStripe().checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: selectedPackage.name,
                            description: `${selectedPackage.coins.toLocaleString()} Quik Darts Coins`,
                        },
                        unit_amount: selectedPackage.priceUsd,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl,
            metadata: {
                userId,
                packageId,
                coins: String(selectedPackage.coins),
            },
            // Prevent duplicate fulfillment
            client_reference_id: userId,
        });
        console.log(`[createStripeCheckout] Checkout session created successfully`);
        return {
            success: true,
            sessionId: session.id,
            url: session.url || undefined,
        };
    }
    catch (error) {
        console.error('[createStripeCheckout] Stripe error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to create checkout session. Please try again.');
    }
});
//# sourceMappingURL=createStripeCheckout.js.map