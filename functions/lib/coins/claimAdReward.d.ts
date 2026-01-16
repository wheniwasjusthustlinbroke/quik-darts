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
export declare const claimAdReward: functions.HttpsFunction & functions.Runnable<any>;
