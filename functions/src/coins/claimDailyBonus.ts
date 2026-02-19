/**
 * Claim Daily Bonus
 *
 * Awards daily login bonus to signed-in users.
 * Resets at midnight in user's local timezone.
 *
 * Security:
 * - Rejects anonymous auth
 * - Uses server timestamp (prevents clock manipulation)
 * - Atomic transaction (prevents race conditions)
 * - Validates timezone input (prevents injection)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.database();

// Daily bonus amount
const DAILY_BONUS = 50;

interface ClaimDailyBonusRequest {
  timezone?: string; // IANA timezone, e.g., "America/New_York"
}

interface ClaimResult {
  success: boolean;
  coinsAwarded?: number;
  newBalance?: number;
  nextClaimTime?: number;
  error?: string;
}

/**
 * Get date string (YYYY-MM-DD) in a specific timezone
 */
function getLocalDateString(timestamp: number, timezone: string): string {
  try {
    return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    // Invalid timezone - fall back to UTC
    return new Date(timestamp).toISOString().split('T')[0];
  }
}

/**
 * Calculate next midnight in user's timezone
 */
function getNextMidnight(timezone: string): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

export const claimDailyBonus = functions
  .region('europe-west1')
  .https.onCall(async (data: ClaimDailyBonusRequest, context): Promise<ClaimResult> => {
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

    // 3. Get and validate timezone from client (default to UTC)
    // SECURITY: Strict IANA timezone validation to prevent injection
    const { timezone = 'UTC' } = data || {};
    let validTimezone = 'UTC';

    // Validate timezone format: must be valid IANA format (e.g., "America/New_York", "Europe/London")
    // Pattern: Region/City or single word like UTC, GMT
    if (typeof timezone === 'string' && timezone.length <= 50) {
      const ianaPattern = /^[A-Z][a-z]+(?:\/[A-Z][a-z_]+)*$|^(?:UTC|GMT)(?:[+-]\d{1,2})?$/;
      if (ianaPattern.test(timezone)) {
        // Double-check by actually trying to use it
        try {
          Intl.DateTimeFormat('en-US', { timeZone: timezone });
          validTimezone = timezone;
        } catch {
          // Invalid timezone - keep UTC default
          console.warn(`[claimDailyBonus] Invalid timezone rejected: ${timezone}`);
        }
      }
    }

    // 4. Read wallet to check existence BEFORE transaction
    const walletSnap = await walletRef.once('value');
    const currentWallet = walletSnap.val();

    if (!currentWallet) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Account not initialized. Call initializeNewUser first.'
      );
    }

    // 5. Check if already claimed TODAY (midnight reset)
    const lastClaim = currentWallet.lastDailyBonus || 0;

    if (lastClaim > 0) {
      const lastClaimDate = getLocalDateString(lastClaim, validTimezone);
      const todayDate = getLocalDateString(now, validTimezone);

      if (lastClaimDate === todayDate) {
        return {
          success: false,
          nextClaimTime: getNextMidnight(validTimezone),
          error: 'Already claimed today',
        };
      }
    }

    // 6. Atomic transaction for awarding coins
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

      // Double-check date in transaction (in case of race condition)
      const txLastClaim = wallet.lastDailyBonus || 0;
      if (txLastClaim > 0) {
        const txLastDate = getLocalDateString(txLastClaim, validTimezone);
        const txTodayDate = getLocalDateString(now, validTimezone);
        if (txLastDate === txTodayDate) {
          return; // Abort - already claimed today
        }
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
      // Race condition - another request claimed first today
      return {
        success: false,
        nextClaimTime: getNextMidnight(validTimezone),
        error: 'Already claimed today',
      };
    }

    // 7. Log transaction (non-critical - wallet already credited)
    const txnId = `daily_${now}`;
    const newBalance = result.snapshot.val()?.coins ?? 0;

    try {
      await transactionsRef.child(txnId).set({
        type: 'daily',
        amount: DAILY_BONUS,
        description: 'Daily login bonus',
        timestamp: now,
        balanceAfter: newBalance,
      });
    } catch (e) {
      console.error(`[claimDailyBonus] WARN - transaction log failed userId=${userId} txnId=${txnId}:`, e);
      // Do NOT throw - wallet is already credited
    }

    console.log(`[claimDailyBonus] Daily bonus claimed successfully`);

    return {
      success: true,
      coinsAwarded: DAILY_BONUS,
      newBalance,
      nextClaimTime: getNextMidnight(validTimezone),
    };
  });
