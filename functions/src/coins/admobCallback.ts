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
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.database();

// Google's public keys URL for AdMob SSV
const ADMOB_PUBLIC_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

// Cache for Google's public keys (in memory)
let cachedKeys: { [keyId: string]: string } = {};
let keysCacheExpiry = 0;

// Cache duration: 1 hour
const KEYS_CACHE_DURATION_MS = 60 * 60 * 1000;

interface AdMobSSVParams {
  ad_network: string;
  ad_unit: string;
  custom_data?: string; // We use this to pass userId
  reward_amount: string;
  reward_item: string;
  signature: string;
  timestamp: string;
  transaction_id: string;
  key_id: string;
}

/**
 * Fetch Google's public keys for AdMob SSV verification
 */
async function fetchPublicKeys(): Promise<{ [keyId: string]: string }> {
  const now = Date.now();

  // Return cached keys if still valid
  if (cachedKeys && Object.keys(cachedKeys).length > 0 && now < keysCacheExpiry) {
    return cachedKeys;
  }

  try {
    const response = await fetch(ADMOB_PUBLIC_KEYS_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch keys: ${response.status}`);
    }

    const data = await response.json();

    // Google returns keys in format: { keys: [ { keyId: number, pem: string, base64: string }, ... ] }
    const keys: { [keyId: string]: string } = {};
    if (data.keys && Array.isArray(data.keys)) {
      for (const key of data.keys) {
        // Use base64 encoded key (DER format)
        keys[String(key.keyId)] = key.pem || key.base64;
      }
    }

    cachedKeys = keys;
    keysCacheExpiry = now + KEYS_CACHE_DURATION_MS;

    console.log(`[admobCallback] Fetched ${Object.keys(keys).length} public keys from Google`);
    return keys;
  } catch (error) {
    console.error('[admobCallback] Failed to fetch public keys:', error);
    throw new functions.https.HttpsError('internal', 'Failed to verify ad reward');
  }
}

/**
 * Build the message to verify from query parameters
 * Google signs all parameters except 'signature' and 'key_id'
 */
function buildMessageToVerify(params: Record<string, string>): string {
  // Get all parameters except signature and key_id, sorted alphabetically
  const keysToSign = Object.keys(params)
    .filter(k => k !== 'signature' && k !== 'key_id')
    .sort();

  // Build query string format: key1=value1&key2=value2&...
  return keysToSign.map(k => `${k}=${params[k]}`).join('&');
}

/**
 * Verify the AdMob SSV signature
 */
async function verifySignature(params: AdMobSSVParams): Promise<boolean> {
  const keys = await fetchPublicKeys();

  const publicKey = keys[params.key_id];
  if (!publicKey) {
    console.error(`[admobCallback] Unknown key_id: ${params.key_id}`);
    return false;
  }

  const message = buildMessageToVerify(params as unknown as Record<string, string>);

  try {
    // Decode the signature from base64 URL-safe format
    const signatureBuffer = Buffer.from(
      params.signature.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    );

    // Create verifier with SHA256
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(message);
    verify.end();

    // Format the key as PEM if it's not already
    let pemKey = publicKey;
    if (!pemKey.includes('-----BEGIN')) {
      pemKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
    }

    return verify.verify(pemKey, signatureBuffer);
  } catch (error) {
    console.error('[admobCallback] Signature verification error:', error);
    return false;
  }
}

/**
 * AdMob SSV Callback HTTP Endpoint
 *
 * Google calls this URL when a user finishes watching a rewarded ad.
 * URL format: https://[region]-[project].cloudfunctions.net/admobCallback
 */
export const admobCallback = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    // Only accept GET requests (AdMob uses GET)
    if (req.method !== 'GET') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Extract parameters from query string
    const params = req.query as unknown as AdMobSSVParams;

    // Validate required parameters
    const requiredParams = ['signature', 'key_id', 'transaction_id', 'timestamp'];
    for (const param of requiredParams) {
      if (!params[param as keyof AdMobSSVParams]) {
        console.error(`[admobCallback] Missing required parameter: ${param}`);
        res.status(400).send(`Missing parameter: ${param}`);
        return;
      }
    }

    // Validate parameter lengths to prevent DoS
    const maxLengths: Record<string, number> = {
      signature: 512,
      key_id: 50,
      transaction_id: 256,
      timestamp: 20,
      ad_network: 100,
      ad_unit: 100,
      custom_data: 256,
      reward_amount: 20,
      reward_item: 100,
    };

    for (const [key, maxLen] of Object.entries(maxLengths)) {
      const value = params[key as keyof AdMobSSVParams];
      if (value && typeof value === 'string' && value.length > maxLen) {
        console.error(`[admobCallback] Parameter ${key} exceeds max length`);
        res.status(200).send('OK');
        return;
      }
    }

    // Extract userId from custom_data (we set this when showing the ad)
    const userId = params.custom_data;
    if (!userId) {
      console.error('[admobCallback] Missing custom_data (userId)');
      // Return 200 to acknowledge receipt but don't record
      res.status(200).send('OK');
      return;
    }

    // Validate userId format (Firebase UID)
    if (userId.length < 20 || userId.length > 128 || !/^[a-zA-Z0-9]+$/.test(userId)) {
      console.error(`[admobCallback] Invalid userId format`);
      res.status(200).send('OK');
      return;
    }

    // Validate and sanitize transaction_id
    // Firebase keys can't contain: . $ # [ ] /
    // Also limit length to prevent DoS
    const transactionId = params.transaction_id;
    if (!transactionId || transactionId.length > 256 || !/^[a-zA-Z0-9_\-:]+$/.test(transactionId)) {
      console.error(`[admobCallback] Invalid transaction_id format`);
      res.status(200).send('OK');
      return;
    }

    // Check for replay attack - transaction_id must be unique
    const transactionRef = db.ref(`verifiedAdRewards/${transactionId}`);
    const existingTransaction = await transactionRef.once('value');

    if (existingTransaction.exists()) {
      console.log(`[admobCallback] Duplicate transaction - already processed`);
      // Return 200 - already processed
      res.status(200).send('OK');
      return;
    }

    // Verify the signature
    const isValid = await verifySignature(params);
    if (!isValid) {
      console.error(`[admobCallback] Invalid signature - verification failed`);
      // Return 200 to not trigger retries, but log the issue
      res.status(200).send('OK');
      return;
    }

    // Signature is valid - record the verified ad completion
    const now = Date.now();
    await transactionRef.set({
      userId,
      adNetwork: params.ad_network,
      adUnit: params.ad_unit,
      rewardAmount: params.reward_amount,
      rewardItem: params.reward_item,
      timestamp: parseInt(params.timestamp, 10) || now,
      verifiedAt: now,
      claimed: false,
    });

    console.log(`[admobCallback] Ad reward verified successfully`);

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  });
