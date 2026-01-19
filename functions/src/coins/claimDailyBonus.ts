/**
 * Claim Daily Bonus
 *
 * Awards daily login bonus to signed-in users.
 * Can only be claimed once per 24-hour period.
 *
 * Security:
 * - Rejects anonymous auth
 * - Uses server timestamp (prevents clock manipulation)
 * - Atomic transaction (prevents race conditions)
 * - Checks 24-hour cooldown server-side
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.database();

// Daily bonus amount
const DAILY_BONUS = 50;

// Cooldown in milliseconds (24 hours)
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface ClaimResult {
  success: boolean;
  coinsAwarded?: number;
  newBalance?: number;
  nextClaimTime?: number;
  error?: string;
}

export const claimDailyBonus = functions
  .region('europe-west1')
  .https.onCall(async (data, context): Promise<ClaimResult> => {
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
        'Daily bonus is only available for signed-in accounts'
      );
    }

    const now = Date.now();
    const walletRef = db.ref(`users/${userId}/wallet`);
    const transactionsRef = db.ref(`users/${userId}/transactions`);

    // 3. Read wallet to check existence and cooldown BEFORE transaction
    const walletSnap = await walletRef.once('value');
    const currentWallet = walletSnap.val();

    if (!currentWallet) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Account not initialized. Call initializeNewUser first.'
      );
    }

    // 4. Check cooldown BEFORE transaction
    const lastClaim = currentWallet.lastDailyBonus || 0;
    const timeSinceLastClaim = now - lastClaim;

    if (timeSinceLastClaim < COOLDOWN_MS) {
      const nextClaimTime = lastClaim + COOLDOWN_MS;
      return {
        success: false,
        nextClaimTime,
        error: 'Already claimed today',
      };
    }

    // 5. Atomic transaction for awarding coins (only handles the write, not the check)
    const result = await walletRef.transaction((wallet) => {
      if (wallet === null) {
        // This shouldn't happen since we checked above, but handle it
        return {
          coins: DAILY_BONUS,
          lifetimeEarnings: DAILY_BONUS,
          lifetimeSpent: 0,
          lastDailyBonus: now,
          lastAdReward: 0,
          adRewardsToday: 0,
          version: 1,
        };
      }

      // Double-check cooldown in transaction (in case of race condition)
      const txLastClaim = wallet.lastDailyBonus || 0;
      if (now - txLastClaim < COOLDOWN_MS) {
        return; // Abort - race condition
      }
      return {
        ...wallet,
        coins: (wallet.coins || 0) + DAILY_BONUS,
        lifetimeEarnings: (wallet.lifetimeEarnings || 0) + DAILY_BONUS,
        lastDailyBonus: now,
        version: (wallet.version || 0) + 1,
      };
    });

    if (!result.committed) {
      // Race condition - another request claimed first
      const updatedWallet = await walletRef.once('value');
      const lastBonus = updatedWallet.val()?.lastDailyBonus || 0;
      return {
        success: false,
        nextClaimTime: lastBonus + COOLDOWN_MS,
        error: 'Already claimed today',
      };
    }

    // 6. Log transaction
    const txnId = `daily_${now}`;
    const newBalance = result.snapshot.val()?.coins || 0;

    await transactionsRef.child(txnId).set({
      type: 'daily',
      amount: DAILY_BONUS,
      description: 'Daily login bonus',
      timestamp: now,
      balanceAfter: newBalance,
    });

    console.log(`[claimDailyBonus] Daily bonus claimed successfully`);

    return {
      success: true,
      coinsAwarded: DAILY_BONUS,
      newBalance,
      nextClaimTime: now + COOLDOWN_MS,
    };
  });
