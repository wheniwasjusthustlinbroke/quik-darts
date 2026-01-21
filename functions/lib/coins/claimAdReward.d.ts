/**
 * Claim Ad Reward
 *
 * Awards coins for watching a rewarded video ad.
 * This function claims a verified ad completion recorded by the admobCallback.
 *
 * Flow:
 * 1. User watches rewarded ad in app
 * 2. AdMob calls admobCallback with signed verification
 * 3. admobCallback verifies and stores the completion in verifiedAdRewards/
 * 4. User's client calls this function with the transactionId
 * 5. This function verifies and awards coins
 *
 * Security:
 * - Rejects anonymous auth
 * - Only awards coins for server-verified ad completions
 * - Rate limited: max 5 ads per day
 * - Each transactionId can only be claimed once (atomic check)
 * - Uses transactions to prevent race conditions
 * - Claims are never reverted to prevent race condition exploitation
 */
import * as functions from 'firebase-functions';
export declare const claimAdReward: functions.HttpsFunction & functions.Runnable<any>;
