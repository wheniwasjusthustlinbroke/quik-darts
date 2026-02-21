/**
 * Claim Daily Bonus
 *
 * Awards daily login bonus to signed-in users.
 * Resets at midnight in user's stored timezone.
 *
 * Security:
 * - Rejects anonymous auth
 * - Uses server timestamp (prevents clock manipulation)
 * - Atomic transaction (prevents race conditions)
 * - Server-pinned timezone (prevents timezone manipulation exploit)
 *   - Timezone set on first claim only, never mutated afterward
 *   - Timezone changes go through updateProfile with cooldown
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { checkRateLimit, RATE_LIMITS } from '../utils/rateLimit';

const db = admin.database();

// Daily bonus amount
const DAILY_BONUS = 50;

interface ClaimDailyBonusRequest {
  timezone?: string; // IANA timezone - only used for first claim, ignored afterward
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
 * Fallback: next UTC midnight
 */
function nextUtcMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

/**
 * Calculate next midnight in user's timezone (DST-safe).
 * Uses binary search with getLocalDateString as single source of truth.
 * @param timeZone - IANA timezone string
 * @param nowMs - Current timestamp (passed in for stability)
 */
function getNextMidnight(timeZone: string, nowMs: number): number {
  try {
    const today = getLocalDateString(nowMs, timeZone);

    // Bracket: find a time in the next day
    let lo = nowMs;
    let hi = nowMs + 36 * 60 * 60 * 1000; // 36h covers DST day length changes

    while (getLocalDateString(hi, timeZone) === today) {
      hi += 12 * 60 * 60 * 1000;
      if (hi - nowMs > 72 * 60 * 60 * 1000) {
        return nextUtcMidnight(nowMs); // fail-safe
      }
    }

    // Binary search for first ms where date changes
    while (hi - lo > 1) { // ms precision for accurate client hint
      const mid = Math.floor((lo + hi) / 2);
      if (getLocalDateString(mid, timeZone) === today) lo = mid;
      else hi = mid;
    }

    return hi;
  } catch {
    return nextUtcMidnight(nowMs);
  }
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

    // 2.5. Rate limiting
    await checkRateLimit(userId, 'claimDailyBonus', RATE_LIMITS.claimDailyBonus.limit, RATE_LIMITS.claimDailyBonus.windowMs);

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

    // 5. Determine effective timezone (server-pinned, prevents manipulation)
    // Use stored timezone if it exists, otherwise use validated client timezone (first claim only)
    const storedTimezone = currentWallet.dailyBonusTimezone;
    const effectiveTimezone = storedTimezone || validTimezone;

    // 6. Check if already claimed TODAY (midnight reset in effective timezone)
    const lastClaim = currentWallet.lastDailyBonus || 0;

    if (lastClaim > 0) {
      const lastClaimDate = getLocalDateString(lastClaim, effectiveTimezone);
      const todayDate = getLocalDateString(now, effectiveTimezone);

      if (lastClaimDate === todayDate) {
        return {
          success: false,
          nextClaimTime: getNextMidnight(effectiveTimezone, now),
          error: 'Already claimed today',
        };
      }
    }

    // 7. Atomic transaction for awarding coins
    const result = await walletRef.transaction((wallet) => {
      if (wallet === null) {
        // This shouldn't happen since we checked above, but handle it
        return {
          coins: DAILY_BONUS,
          lifetimeEarnings: DAILY_BONUS,
          lifetimeSpent: 0,
          lastDailyBonus: now,
          dailyBonusTimezone: validTimezone, // Set timezone on first claim
          lastAdReward: 0,
          adRewardsToday: 0,
          version: 1,
        };
      }

      // Determine timezone for transaction (use stored, fallback to validated client)
      const txEffectiveTimezone = wallet.dailyBonusTimezone || validTimezone;

      // Double-check date in transaction (in case of race condition)
      const txLastClaim = wallet.lastDailyBonus || 0;
      if (txLastClaim > 0) {
        const txLastDate = getLocalDateString(txLastClaim, txEffectiveTimezone);
        const txTodayDate = getLocalDateString(now, txEffectiveTimezone);
        if (txLastDate === txTodayDate) {
          return; // Abort - already claimed today
        }
      }

      // Build update - only set dailyBonusTimezone if missing (first claim)
      const update: Record<string, unknown> = {
        ...wallet,
        coins: (wallet.coins || 0) + DAILY_BONUS,
        lifetimeEarnings: (wallet.lifetimeEarnings || 0) + DAILY_BONUS,
        lastDailyBonus: now,
        version: (wallet.version || 0) + 1,
      };

      // Set timezone only on first claim (never mutate afterward)
      if (!wallet.dailyBonusTimezone) {
        update.dailyBonusTimezone = validTimezone;
      }

      return update;
    });

    if (!result.committed) {
      // Race condition - another request claimed first today
      return {
        success: false,
        nextClaimTime: getNextMidnight(effectiveTimezone, now),
        error: 'Already claimed today',
      };
    }

    // 8. Log transaction (non-critical - wallet already credited)
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

    // Use committed snapshot timezone (handles concurrent first-claim race)
    const committedWallet = result.snapshot.val();
    const committedTz = committedWallet?.dailyBonusTimezone || effectiveTimezone;

    return {
      success: true,
      coinsAwarded: DAILY_BONUS,
      newBalance,
      nextClaimTime: getNextMidnight(committedTz, now),
    };
  });
