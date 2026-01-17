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
export declare const createStripeCheckout: functions.HttpsFunction & functions.Runnable<any>;
