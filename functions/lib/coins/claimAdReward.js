"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimAdReward = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const node_crypto_1 = require("node:crypto");
const db = admin.database();
// Coins per ad watched
const AD_REWARD = 25;
// Max ads per day
const MAX_ADS_PER_DAY = 5;
// Milliseconds in a day
const DAY_MS = 24 * 60 * 60 * 1000;
// Stale claim locks can be retried after this duration (2 minutes)
const AD_REWARD_LOCK_TIMEOUT_MS = 120000;
// Max age for unclaimed rewards (24 hours)
const MAX_REWARD_AGE_MS = 24 * 60 * 60 * 1000;
exports.claimAdReward = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    const token = context.auth.token;
    // 2. Must NOT be anonymous
    if (token.firebase?.sign_in_provider === 'anonymous') {
        throw new functions.https.HttpsError('permission-denied', 'Ad rewards are only available for signed-in accounts');
    }
    // 3. Validate transactionId
    const { transactionId } = data;
    if (!transactionId || typeof transactionId !== 'string' || transactionId.length < 10) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid transaction ID');
    }
    // Sanitize transactionId - only alphanumeric and common characters
    // Firebase Realtime Database keys can't contain: . $ # [ ] /
    if (!/^[a-zA-Z0-9_\-:]+$/.test(transactionId) || transactionId.length > 256) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid transaction ID format');
    }
    const now = Date.now();
    const verifiedRewardRef = db.ref(`verifiedAdRewards/${transactionId}`);
    const requestId = `ad_${userId}_${(0, node_crypto_1.randomUUID)()}`;
    // 4. ATOMIC: Acquire claim lock (verified → processing, with stale takeover)
    const claimResult = await verifiedRewardRef.transaction((reward) => {
        // Strict null/shape check
        if (reward == null || typeof reward !== 'object')
            return; // Abort - missing/invalid
        // Verify the reward belongs to this user
        if (reward.userId !== userId)
            return; // Abort - wrong user (don't expose via error)
        // Check if reward is expired (24 hours max)
        if (now - (reward.verifiedAt || 0) > MAX_REWARD_AGE_MS)
            return; // Abort - expired
        // State machine: verified → processing → completed
        // Backward compat: treat claimed:true as 'completed'
        const status = reward.status || (reward.claimed ? 'completed' : 'verified');
        if (status === 'completed')
            return; // Abort - already done
        if (status === 'processing') {
            // Check if stale (allow takeover after timeout)
            const lockAge = now - (reward.processingStartedAt || 0);
            if (lockAge < AD_REWARD_LOCK_TIMEOUT_MS) {
                return; // Abort - another request is processing
            }
            console.log(`[claimAdReward] Stale processing lock (>${AD_REWARD_LOCK_TIMEOUT_MS}ms), allowing takeover for ${transactionId}`);
        }
        if (status !== 'verified' && status !== 'processing') {
            return; // Abort - unexpected state
        }
        // Acquire processing lock
        return {
            ...reward,
            status: 'processing',
            processingRequestId: requestId,
            processingStartedAt: now,
            claimError: null,
        };
    });
    // Handle lock acquisition results
    const rewardAfterLock = claimResult.snapshot.val();
    if (!claimResult.committed || rewardAfterLock?.processingRequestId !== requestId) {
        // Discriminate: missing vs. expired vs. completed vs. in-progress
        if (!rewardAfterLock) {
            throw new functions.https.HttpsError('not-found', 'Ad reward not found. Please watch the complete ad.');
        }
        // Don't expose wrong-user (prevents transaction ID probing)
        if (rewardAfterLock.userId !== userId) {
            throw new functions.https.HttpsError('not-found', 'Ad reward not found. Please watch the complete ad.');
        }
        if (now - (rewardAfterLock.verifiedAt || 0) > MAX_REWARD_AGE_MS) {
            throw new functions.https.HttpsError('deadline-exceeded', 'This reward has expired');
        }
        const status = rewardAfterLock.status || (rewardAfterLock.claimed ? 'completed' : 'verified');
        if (status === 'completed' || rewardAfterLock.claimed) {
            throw new functions.https.HttpsError('already-exists', 'This reward has already been claimed');
        }
        // processing = another request owns the lock, client can retry
        if (status === 'processing') {
            throw new functions.https.HttpsError('aborted', 'Claim in progress. Please retry in a moment.');
        }
        // verified but we didn't commit = abnormal (RTDB exhausted retries under contention)
        // Log it but throw - client will retry naturally
        console.error(`[claimAdReward] CRITICAL: Lock not acquired but status=${status} (txId=${transactionId})`);
        throw new functions.https.HttpsError('internal', 'Failed to acquire claim lock.');
    }
    // 5. Award coins with atomic transaction + idempotency marker
    const walletRef = db.ref(`users/${userId}/wallet`);
    const walletResult = await walletRef.transaction((wallet) => {
        if (wallet == null)
            return; // Abort - no wallet
        // Idempotency: check if already credited for this transaction
        const markers = wallet.rewardMarkers ?? {};
        if (markers[transactionId])
            return; // Abort - already applied
        // Check daily limit
        const lastAdDay = wallet.lastAdReward ? Math.floor(wallet.lastAdReward / DAY_MS) : 0;
        const currentDay = Math.floor(now / DAY_MS);
        const adsToday = currentDay > lastAdDay ? 0 : (wallet.adRewardsToday ?? 0);
        if (adsToday >= MAX_ADS_PER_DAY)
            return; // Abort - daily limit (no marker written)
        // Award coins with marker (atomic)
        return {
            ...wallet,
            coins: (wallet.coins ?? 0) + AD_REWARD,
            lifetimeEarnings: (wallet.lifetimeEarnings ?? 0) + AD_REWARD,
            lastAdReward: now,
            adRewardsToday: adsToday + 1,
            version: (wallet.version ?? 0) + 1,
            rewardMarkers: {
                ...markers,
                [transactionId]: { requestId, ts: now, amount: AD_REWARD, type: 'ad' },
            },
        };
    });
    // Track whether WE applied the credit (for transaction log)
    let weAppliedCredit = walletResult.committed;
    if (!walletResult.committed) {
        // 1) Check if marker exists (idempotent success)
        let markerSnap;
        try {
            markerSnap = await walletRef.child(`rewardMarkers/${transactionId}`).once('value');
        }
        catch (e) {
            console.error(`[claimAdReward] Marker read failed for ${userId}, txId=${transactionId}:`, e);
            await verifiedRewardRef.update({
                status: 'verified',
                processingRequestId: null,
                processingStartedAt: null,
                claimError: `marker_check_failed_${requestId}`,
                claimErrorAt: now,
            });
            throw new functions.https.HttpsError('unavailable', 'Failed to verify claim. Please retry.');
        }
        if (!markerSnap.exists()) {
            // 2) No marker: determine if wallet missing or daily limit or transient failure
            const walletSnap = await walletRef.once('value');
            const wallet = walletSnap.val();
            await verifiedRewardRef.update({
                status: 'verified',
                processingRequestId: null,
                processingStartedAt: null,
                claimError: `wallet_failed_${requestId}`,
                claimErrorAt: now,
            });
            if (!wallet) {
                throw new functions.https.HttpsError('failed-precondition', 'Account not initialized. Please restart the app.');
            }
            const lastAdDay = wallet.lastAdReward ? Math.floor(wallet.lastAdReward / DAY_MS) : 0;
            const currentDay = Math.floor(now / DAY_MS);
            const adsToday = currentDay > lastAdDay ? 0 : (wallet.adRewardsToday ?? 0);
            if (adsToday >= MAX_ADS_PER_DAY) {
                throw new functions.https.HttpsError('resource-exhausted', `Daily limit reached (${MAX_ADS_PER_DAY} ads per day)`);
            }
            throw new functions.https.HttpsError('unavailable', 'Failed to award coins. Please retry.');
        }
        // Marker exists: idempotent success, continue to finalize
        console.log(`[claimAdReward] Already credited (marker present) txId=${transactionId}`);
    }
    // 6. Finalize reward (processing → completed)
    await verifiedRewardRef.update({
        status: 'completed',
        claimed: true, // Backward compat
        claimedAt: now,
        processingRequestId: null,
        processingStartedAt: null,
        claimError: null,
        claimErrorAt: null,
    });
    // 7. Log transaction ONLY if WE applied the credit
    const walletAfter = walletResult.snapshot.val() ?? (await walletRef.once('value')).val();
    const newBalance = walletAfter?.coins ?? 0;
    const adsToday = walletAfter?.adRewardsToday ?? 0;
    if (weAppliedCredit) {
        try {
            await db.ref(`users/${userId}/transactions`).push({
                type: 'ad',
                amount: AD_REWARD,
                description: 'Watched rewarded ad',
                timestamp: now,
                balanceAfter: newBalance,
                transactionId,
            });
        }
        catch (e) {
            console.error(`[claimAdReward] WARN - transaction log failed for ${userId}:`, e);
        }
    }
    console.log(`[claimAdReward] Ad reward claimed successfully (${adsToday}/${MAX_ADS_PER_DAY} today)`);
    return {
        success: true,
        coinsAwarded: AD_REWARD,
        newBalance,
        adsRemainingToday: MAX_ADS_PER_DAY - adsToday,
    };
});
//# sourceMappingURL=claimAdReward.js.map