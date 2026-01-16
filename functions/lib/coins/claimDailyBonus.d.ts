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
export declare const claimDailyBonus: functions.HttpsFunction & functions.Runnable<any>;
