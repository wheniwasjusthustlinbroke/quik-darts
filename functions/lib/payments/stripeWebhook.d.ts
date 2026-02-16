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
import * as functions from 'firebase-functions';
export declare const COIN_PACKAGES: Record<string, {
    coins: number;
}>;
export declare const stripeWebhook: functions.HttpsFunction;
