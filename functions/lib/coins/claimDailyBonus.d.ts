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
export declare const claimDailyBonus: functions.HttpsFunction & functions.Runnable<any>;
