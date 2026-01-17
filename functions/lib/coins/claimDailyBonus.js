"use strict";
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
exports.claimDailyBonus = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.database();
// Daily bonus amount
const DAILY_BONUS = 50;
// Cooldown in milliseconds (24 hours)
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
exports.claimDailyBonus = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    console.log('[claimDailyBonus] Function called');
    console.log('[claimDailyBonus] Auth:', context.auth ? `uid=${context.auth.uid}` : 'null');
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    const token = context.auth.token;
    console.log('[claimDailyBonus] Provider:', token.firebase?.sign_in_provider);
    // 2. Must NOT be anonymous
    if (token.firebase?.sign_in_provider === 'anonymous') {
        throw new functions.https.HttpsError('permission-denied', 'Daily bonus is only available for signed-in accounts');
    }
    const now = Date.now();
    const walletRef = db.ref(`users/${userId}/wallet`);
    const transactionsRef = db.ref(`users/${userId}/transactions`);
    console.log(`[claimDailyBonus] Starting claim for user ${userId}`);
    // 3. Read wallet to check existence and cooldown BEFORE transaction
    const walletSnap = await walletRef.once('value');
    const currentWallet = walletSnap.val();
    if (!currentWallet) {
        console.log(`[claimDailyBonus] No wallet found for user ${userId}`);
        throw new functions.https.HttpsError('failed-precondition', 'Account not initialized. Call initializeNewUser first.');
    }
    console.log(`[claimDailyBonus] Current wallet:`, JSON.stringify(currentWallet));
    // 4. Check cooldown BEFORE transaction
    const lastClaim = currentWallet.lastDailyBonus || 0;
    const timeSinceLastClaim = now - lastClaim;
    console.log(`[claimDailyBonus] lastDailyBonus: ${lastClaim}, timeSince: ${timeSinceLastClaim}ms, cooldown: ${COOLDOWN_MS}ms`);
    if (timeSinceLastClaim < COOLDOWN_MS) {
        const nextClaimTime = lastClaim + COOLDOWN_MS;
        console.log(`[claimDailyBonus] On cooldown until ${new Date(nextClaimTime).toISOString()}`);
        return {
            success: false,
            nextClaimTime,
            error: 'Already claimed today',
        };
    }
    console.log(`[claimDailyBonus] Cooldown passed, awarding ${DAILY_BONUS} coins via transaction`);
    // 5. Atomic transaction for awarding coins (only handles the write, not the check)
    const result = await walletRef.transaction((wallet) => {
        console.log(`[claimDailyBonus] Transaction callback, wallet:`, wallet ? 'exists' : 'null');
        if (wallet === null) {
            // This shouldn't happen since we checked above, but handle it
            console.log(`[claimDailyBonus] Unexpected null wallet in transaction`);
            return {
                coins: DAILY_BONUS,
                lifetimeEarnings: DAILY_BONUS,
                lifetimeSpent: 0,
                lastDailyBonus: now,
                lastAdReward: 0,
                adRewardsToday: 0,
                version: 1,
            };
        }
        // Double-check cooldown in transaction (in case of race condition)
        const txLastClaim = wallet.lastDailyBonus || 0;
        if (now - txLastClaim < COOLDOWN_MS) {
            console.log(`[claimDailyBonus] Race condition - already claimed in another request`);
            return; // Abort
        }
        console.log(`[claimDailyBonus] Updating wallet: ${wallet.coins} + ${DAILY_BONUS} = ${(wallet.coins || 0) + DAILY_BONUS}`);
        return {
            ...wallet,
            coins: (wallet.coins || 0) + DAILY_BONUS,
            lifetimeEarnings: (wallet.lifetimeEarnings || 0) + DAILY_BONUS,
            lastDailyBonus: now,
            version: (wallet.version || 0) + 1,
        };
    });
    console.log(`[claimDailyBonus] Transaction committed: ${result.committed}`);
    if (!result.committed) {
        // Race condition - another request claimed first
        console.log(`[claimDailyBonus] Transaction aborted - race condition`);
        const updatedWallet = await walletRef.once('value');
        const lastBonus = updatedWallet.val()?.lastDailyBonus || 0;
        return {
            success: false,
            nextClaimTime: lastBonus + COOLDOWN_MS,
            error: 'Already claimed today',
        };
    }
    // 6. Log transaction
    const txnId = `daily_${now}`;
    const newBalance = result.snapshot.val()?.coins || 0;
    await transactionsRef.child(txnId).set({
        type: 'daily',
        amount: DAILY_BONUS,
        description: 'Daily login bonus',
        timestamp: now,
        balanceAfter: newBalance,
    });
    console.log(`[claimDailyBonus] User ${userId} claimed ${DAILY_BONUS} coins`);
    return {
        success: true,
        coinsAwarded: DAILY_BONUS,
        newBalance,
        nextClaimTime: now + COOLDOWN_MS,
    };
});
//# sourceMappingURL=claimDailyBonus.js.map