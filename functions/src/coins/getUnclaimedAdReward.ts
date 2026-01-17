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

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.database();

// Max age for unclaimed rewards (24 hours)
const MAX_REWARD_AGE_MS = 24 * 60 * 60 * 1000;

interface UnclaimedRewardResult {
  found: boolean;
  transactionId?: string;
  verifiedAt?: number;
}

export const getUnclaimedAdReward = functions
  .region('europe-west1')
  .https.onCall(async (data, context): Promise<UnclaimedRewardResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in'
      );
    }

    const userId = context.auth.uid;
    const token = context.auth.token;

    // 2. Must NOT be anonymous
    if (token.firebase?.sign_in_provider === 'anonymous') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Ad rewards are only available for signed-in accounts'
      );
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
    let latestReward: { transactionId: string; verifiedAt: number } | null = null;

    for (const [transactionId, reward] of Object.entries(rewards)) {
      const r = reward as {
        userId: string;
        claimed: boolean;
        verifiedAt: number;
      };

      // Must belong to this user
      if (r.userId !== userId) continue;

      // Must not be claimed
      if (r.claimed) continue;

      // Must not be expired
      if (now - r.verifiedAt > MAX_REWARD_AGE_MS) continue;

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
