/**
 * Quik Darts Cloud Functions
 *
 * Server-authoritative game logic and coin economy.
 * All coin operations and game state changes go through these functions.
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// ============================================
// COINS - Award and manage coin balance
// ============================================
export { initializeNewUser } from './coins/initializeNewUser';
export { claimDailyBonus } from './coins/claimDailyBonus';
export { claimAdReward } from './coins/claimAdReward';
export { admobCallback } from './coins/admobCallback';
export { getUnclaimedAdReward } from './coins/getUnclaimedAdReward';

// ============================================
// GAMEPLAY - Server-authoritative game logic
// ============================================
export { createGame } from './gameplay/createGame';
export { submitThrow } from './gameplay/submitThrow';
export { forfeitGame } from './gameplay/forfeitGame';

// ============================================
// WAGERING - Escrow and settlement
// ============================================
export { createEscrow } from './wagering/createEscrow';
export { settleGame } from './wagering/settleGame';
export { refundEscrow, cleanupExpiredEscrows } from './wagering/refundEscrow';

// ============================================
// PAYMENTS - Stripe (Phase 5)
// ============================================
export { createStripeCheckout } from './payments/createStripeCheckout';
export { stripeWebhook } from './payments/stripeWebhook';
// export { verifyApplePurchase } from './payments/verifyApplePurchase'; // TODO: Phase 5b
