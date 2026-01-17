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

import * as functions from 'firebase-functions';
import Stripe from 'stripe';

// Initialize Stripe with secret key from Firebase secrets
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover',
});

// Coin packages with prices (in cents)
// These should match products created in Stripe Dashboard
const COIN_PACKAGES: Record<string, { coins: number; priceUsd: number; name: string }> = {
  'starter': { coins: 500, priceUsd: 99, name: 'Starter Pack' },
  'popular': { coins: 1200, priceUsd: 199, name: 'Popular Pack' },
  'best_value': { coins: 3500, priceUsd: 499, name: 'Best Value Pack' },
  'pro': { coins: 8000, priceUsd: 999, name: 'Pro Pack' },
  'champion': { coins: 20000, priceUsd: 1999, name: 'Champion Pack' },
};

interface CheckoutRequest {
  packageId: string;
  successUrl: string;
  cancelUrl: string;
}

interface CheckoutResult {
  success: boolean;
  sessionId?: string;
  url?: string;
  error?: string;
}

export const createStripeCheckout = functions
  .runWith({
    secrets: ['STRIPE_SECRET_KEY'],
  })
  .region('europe-west1')
  .https.onCall(async (data: CheckoutRequest, context): Promise<CheckoutResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in to purchase coins'
      );
    }

    const userId = context.auth.uid;
    const token = context.auth.token;

    // 2. Must NOT be anonymous
    if (token.firebase?.sign_in_provider === 'anonymous') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Sign in with Google, Facebook, or Apple to purchase coins'
      );
    }

    // 3. Validate package selection
    const { packageId, successUrl, cancelUrl } = data;

    if (!packageId || typeof packageId !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid package selection'
      );
    }

    const selectedPackage = COIN_PACKAGES[packageId];
    if (!selectedPackage) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Unknown package. Please select a valid coin package.'
      );
    }

    // 4. Validate URLs (basic check)
    if (!successUrl || !cancelUrl) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing redirect URLs'
      );
    }

    // Validate URLs are from allowed domains
    const allowedDomains = ['quikdarts.com', 'localhost', '127.0.0.1'];
    const isValidUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return allowedDomains.some(domain =>
          parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
        );
      } catch {
        return false;
      }
    };

    if (!isValidUrl(successUrl) || !isValidUrl(cancelUrl)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid redirect URLs'
      );
    }

    try {
      // 5. Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
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

      console.log(`[createStripeCheckout] Created session ${session.id} for user ${userId}, package: ${packageId}`);

      return {
        success: true,
        sessionId: session.id,
        url: session.url || undefined,
      };
    } catch (error) {
      console.error('[createStripeCheckout] Stripe error:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to create checkout session. Please try again.'
      );
    }
  });
