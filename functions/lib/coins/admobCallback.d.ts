/**
 * AdMob Server-Side Verification (SSV) Callback
 *
 * This HTTP endpoint receives callbacks from Google AdMob when a user
 * completes watching a rewarded video ad.
 *
 * Flow:
 * 1. User watches rewarded ad in app
 * 2. AdMob calls this endpoint with signed parameters
 * 3. We verify the signature using Google's public keys
 * 4. We record the completed ad in Firebase
 * 5. User's client calls claimAdReward to get coins
 *
 * Security:
 * - Verifies signature using Google's RSA public keys
 * - Stores transaction_id to prevent replay attacks
 * - Only accepts requests from Google's servers
 *
 * See: https://developers.google.com/admob/android/ssv
 */
import * as functions from 'firebase-functions';
/**
 * AdMob SSV Callback HTTP Endpoint
 *
 * Google calls this URL when a user finishes watching a rewarded ad.
 * URL format: https://[region]-[project].cloudfunctions.net/admobCallback
 */
export declare const admobCallback: functions.HttpsFunction;
