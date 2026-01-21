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
const db = admin.database();
// Coins per ad watched
const AD_REWARD = 25;
// Max ads per day
const MAX_ADS_PER_DAY = 5;
// Milliseconds in a day
const DAY_MS = 24 * 60 * 60 * 1000;
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
    // 4. ATOMIC: Check and mark as claimed in a single transaction
    // This prevents race conditions where two calls could both read unclaimed state
    const claimResult = await verifiedRewardRef.transaction((reward) => {
        if (reward === null) {
            // Reward doesn't exist - abort
            return;
        }
        // Verify the reward belongs to this user
        if (reward.userId !== userId) {
            // Return unchanged to abort (will check this after)
            return reward;
        }
        // Check if already claimed
        if (reward.claimed) {
            // Return unchanged to abort
            return reward;
        }
        // Check if reward is expired (24 hours max)
        if (now - reward.verifiedAt > MAX_REWARD_AGE_MS) {
            // Return unchanged to abort
            return reward;
        }
        // Mark as claimed atomically
        return {
            ...reward,
            claimed: true,
            claimedAt: now,
        };
    });
    // Handle transaction results
    if (!claimResult.committed) {
        throw new functions.https.HttpsError('not-found', 'Ad reward not found. Please watch the complete ad.');
    }
    const verifiedReward = claimResult.snapshot.val();
    // Check if it was actually claimed (not just read)
    if (!verifiedReward.claimed || verifiedReward.claimedAt !== now) {
        // Transaction didn't actually update - check why
        if (verifiedReward.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'This reward belongs to a different user');
        }
        if (verifiedReward.claimed) {
            throw new functions.https.HttpsError('already-exists', 'This reward has already been claimed');
        }
        if (now - verifiedReward.verifiedAt > MAX_REWARD_AGE_MS) {
            throw new functions.https.HttpsError('deadline-exceeded', 'This reward has expired');
        }
        // Unknown reason
        throw new functions.https.HttpsError('internal', 'Failed to claim reward');
    }
    // 5. Award coins with atomic transaction
    const walletRef = db.ref(`users/${userId}/wallet`);
    const transactionsRef = db.ref(`users/${userId}/transactions`);
    const walletResult = await walletRef.transaction((wallet) => {
        if (wallet === null) {
            return; // Abort - no wallet
        }
        // Check daily limit
        const lastAdDay = wallet.lastAdReward
            ? Math.floor(wallet.lastAdReward / DAY_MS)
            : 0;
        const currentDay = Math.floor(now / DAY_MS);
        let adsToday = wallet.adRewardsToday || 0;
        // Reset counter if it's a new day
        if (currentDay > lastAdDay) {
            adsToday = 0;
        }
        // Check if at limit
        if (adsToday >= MAX_ADS_PER_DAY) {
            return; // Abort - at limit
        }
        // Award coins
        return {
            ...wallet,
            coins: (wallet.coins || 0) + AD_REWARD,
            lifetimeEarnings: (wallet.lifetimeEarnings || 0) + AD_REWARD,
            lastAdReward: now,
            adRewardsToday: adsToday + 1,
            version: (wallet.version || 0) + 1,
        };
    });
    // Check if wallet transaction was aborted
    if (!walletResult.committed) {
        // SECURITY FIX: Do NOT revert the claim - this creates a race condition window
        // Instead, mark the claim as failed but keep it claimed to prevent double-claiming
        // A scheduled job can reconcile orphaned claims if needed
        await verifiedRewardRef.update({
            claimError: 'wallet_transaction_failed',
            claimErrorAt: now,
        });
        console.error(`[claimAdReward] Wallet transaction failed for user ${userId}, transactionId ${transactionId}`);
        const walletSnap = await walletRef.once('value');
        const wallet = walletSnap.val();
        if (!wallet) {
            throw new functions.https.HttpsError('failed-precondition', 'Account not initialized. Please restart the app.');
        }
        // Check if at daily limit
        const lastAdDay = wallet.lastAdReward
            ? Math.floor(wallet.lastAdReward / DAY_MS)
            : 0;
        const currentDay = Math.floor(now / DAY_MS);
        const adsToday = currentDay > lastAdDay ? 0 : (wallet.adRewardsToday || 0);
        if (adsToday >= MAX_ADS_PER_DAY) {
            return {
                success: false,
                adsRemainingToday: 0,
                error: `Daily limit reached (${MAX_ADS_PER_DAY} ads per day)`,
            };
        }
        throw new functions.https.HttpsError('internal', 'Failed to update wallet. Please try again or contact support.');
    }
    // 6. Log transaction
    const newBalance = walletResult.snapshot.val()?.coins || 0;
    const adsToday = walletResult.snapshot.val()?.adRewardsToday || 1;
    await transactionsRef.child(`ad_${now}`).set({
        type: 'ad',
        amount: AD_REWARD,
        description: 'Watched rewarded ad',
        timestamp: now,
        balanceAfter: newBalance,
        transactionId,
    });
    console.log(`[claimAdReward] Ad reward claimed successfully (${adsToday}/${MAX_ADS_PER_DAY} today)`);
    return {
        success: true,
        coinsAwarded: AD_REWARD,
        newBalance,
        adsRemainingToday: MAX_ADS_PER_DAY - adsToday,
    };
});
//# sourceMappingURL=claimAdReward.js.map