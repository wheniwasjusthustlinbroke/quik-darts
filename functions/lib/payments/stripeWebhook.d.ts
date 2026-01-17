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
import * as functions from 'firebase-functions';
export declare const stripeWebhook: functions.HttpsFunction;
