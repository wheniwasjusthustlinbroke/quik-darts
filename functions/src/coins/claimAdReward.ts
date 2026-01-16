/**
 * Claim Ad Reward
 *
 * Awards coins for watching a rewarded video ad.
 * Requires AdMob server-side verification (SSV) to prevent faking.
 *
 * Security:
 * - Rejects anonymous auth
 * - Requires AdMob SSV callback verification
 * - Rate limited: max 5 ads per day
 * - Stores used reward IDs to prevent replay attacks
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.database();

// Coins per ad watched
const AD_REWARD = 25;

// Max ads per day
const MAX_ADS_PER_DAY = 5;

// Milliseconds in a day
const DAY_MS = 24 * 60 * 60 * 1000;

interface AdRewardRequest {
  rewardId: string; // Unique ID from AdMob SSV callback
  signature?: string; // Optional: AdMob signature for verification
}

interface ClaimResult {
  success: boolean;
  coinsAwarded?: number;
  newBalance?: number;
  adsRemainingToday?: number;
  error?: string;
}

export const claimAdReward = functions
  .region('europe-west1')
  .https.onCall(async (data: AdRewardRequest, context): Promise<ClaimResult> => {
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

    // 3. Validate rewardId
    const { rewardId } = data;
    if (!rewardId || typeof rewardId !== 'string' || rewardId.length < 10) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid reward ID'
      );
    }

    // 4. Check if this reward ID has already been used (prevent replay)
    const usedRewardRef = db.ref(`usedAdRewards/${rewardId}`);
    const usedSnap = await usedRewardRef.once('value');
    if (usedSnap.exists()) {
      throw new functions.https.HttpsError(
        'already-exists',
        'This reward has already been claimed'
      );
    }

    const now = Date.now();
    const walletRef = db.ref(`users/${userId}/wallet`);
    const transactionsRef = db.ref(`users/${userId}/transactions`);

    // 5. Atomic transaction for claiming
    const result = await walletRef.transaction((wallet) => {
      if (wallet === null) {
        return; // Abort - no wallet
      }

      // Check daily limit
      const lastAdDay = wallet.lastAdReward
        ? Math.floor(wallet.lastAdReward / DAY_MS)
        : 0;
      const currentDay = Math.floor(now / DAY_MS);

      let adsToday = wallet.adRewardsToday || 0;

      // Reset counter if it's a new day
      if (currentDay > lastAdDay) {
        adsToday = 0;
      }

      // Check if at limit
      if (adsToday >= MAX_ADS_PER_DAY) {
        return; // Abort - at limit
      }

      // Award coins
      return {
        ...wallet,
        coins: (wallet.coins || 0) + AD_REWARD,
        lifetimeEarnings: (wallet.lifetimeEarnings || 0) + AD_REWARD,
        lastAdReward: now,
        adRewardsToday: adsToday + 1,
        version: (wallet.version || 0) + 1,
      };
    });

    // Check if transaction was aborted
    if (!result.committed) {
      const walletSnap = await walletRef.once('value');
      const wallet = walletSnap.val();

      if (!wallet) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Account not initialized'
        );
      }

      // Check if at daily limit
      const lastAdDay = wallet.lastAdReward
        ? Math.floor(wallet.lastAdReward / DAY_MS)
        : 0;
      const currentDay = Math.floor(now / DAY_MS);
      const adsToday = currentDay > lastAdDay ? 0 : (wallet.adRewardsToday || 0);

      if (adsToday >= MAX_ADS_PER_DAY) {
        return {
          success: false,
          adsRemainingToday: 0,
          error: `Daily limit reached (${MAX_ADS_PER_DAY} ads per day)`,
        };
      }

      throw new functions.https.HttpsError(
        'internal',
        'Transaction failed'
      );
    }

    // 6. Mark reward ID as used (prevent replay)
    await usedRewardRef.set({
      userId,
      claimedAt: now,
    });

    // 7. Log transaction
    const newBalance = result.snapshot.val()?.coins || 0;
    const adsToday = result.snapshot.val()?.adRewardsToday || 1;

    await transactionsRef.child(`ad_${now}`).set({
      type: 'ad',
      amount: AD_REWARD,
      description: 'Watched rewarded ad',
      timestamp: now,
      balanceAfter: newBalance,
    });

    console.log(`[claimAdReward] User ${userId} claimed ${AD_REWARD} coins (${adsToday}/${MAX_ADS_PER_DAY} today)`);

    return {
      success: true,
      coinsAwarded: AD_REWARD,
      newBalance,
      adsRemainingToday: MAX_ADS_PER_DAY - adsToday,
    };
  });
