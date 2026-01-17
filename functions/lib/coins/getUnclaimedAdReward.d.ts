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
export declare const getUnclaimedAdReward: functions.HttpsFunction & functions.Runnable<any>;
