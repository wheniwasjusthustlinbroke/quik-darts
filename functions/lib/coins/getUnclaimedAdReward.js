"use strict";
/**
 * Get Unclaimed Ad Reward
 *
 * Returns the user's most recent unclaimed ad reward, if any.
 * Used by the client after watching an ad to get the transaction ID
 * for claiming the reward.
 *
 * Security:
 * - Only returns rewards belonging to the authenticated user
 * - Only returns unclaimed, non-expired rewards
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
exports.getUnclaimedAdReward = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.database();
// Max age for unclaimed rewards (24 hours)
const MAX_REWARD_AGE_MS = 24 * 60 * 60 * 1000;
exports.getUnclaimedAdReward = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    const token = context.auth.token;
    // 2. Must NOT be anonymous
    if (token.firebase?.sign_in_provider === 'anonymous') {
        throw new functions.https.HttpsError('permission-denied', 'Ad rewards are only available for signed-in accounts');
    }
    const now = Date.now();
    // 3. Query for unclaimed rewards for this user
    // We'll scan the verifiedAdRewards and find the most recent unclaimed one
    const rewardsRef = db.ref('verifiedAdRewards');
    // Get rewards ordered by verifiedAt (most recent first)
    // Note: In production, you'd want an index on userId+claimed for efficiency
    const snapshot = await rewardsRef
        .orderByChild('verifiedAt')
        .limitToLast(10) // Only check recent rewards
        .once('value');
    const rewards = snapshot.val();
    if (!rewards) {
        return { found: false };
    }
    // Find the most recent unclaimed reward for this user
    let latestReward = null;
    for (const [transactionId, reward] of Object.entries(rewards)) {
        const r = reward;
        // Must belong to this user
        if (r.userId !== userId)
            continue;
        // Must not be claimed
        if (r.claimed)
            continue;
        // Must not be expired
        if (now - r.verifiedAt > MAX_REWARD_AGE_MS)
            continue;
        // Is this more recent than what we found?
        if (!latestReward || r.verifiedAt > latestReward.verifiedAt) {
            latestReward = { transactionId, verifiedAt: r.verifiedAt };
        }
    }
    if (!latestReward) {
        return { found: false };
    }
    return {
        found: true,
        transactionId: latestReward.transactionId,
        verifiedAt: latestReward.verifiedAt,
    };
});
//# sourceMappingURL=getUnclaimedAdReward.js.map