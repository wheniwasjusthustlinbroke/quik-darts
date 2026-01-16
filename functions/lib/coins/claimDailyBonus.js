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
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    const token = context.auth.token;
    // 2. Must NOT be anonymous
    if (token.firebase?.sign_in_provider === 'anonymous') {
        throw new functions.https.HttpsError('permission-denied', 'Daily bonus is only available for signed-in accounts');
    }
    const now = Date.now();
    const walletRef = db.ref(`users/${userId}/wallet`);
    const transactionsRef = db.ref(`users/${userId}/transactions`);
    // 3. Atomic transaction for claiming
    const result = await walletRef.transaction((wallet) => {
        if (wallet === null) {
            // No wallet exists - user needs to initialize first
            return; // Abort
        }
        const lastClaim = wallet.lastDailyBonus || 0;
        const timeSinceLastClaim = now - lastClaim;
        // 4. Check cooldown (server-side)
        if (timeSinceLastClaim < COOLDOWN_MS) {
            // Still on cooldown - abort
            return; // Abort - will check committed status
        }
        // 5. Award bonus
        return {
            ...wallet,
            coins: (wallet.coins || 0) + DAILY_BONUS,
            lifetimeEarnings: (wallet.lifetimeEarnings || 0) + DAILY_BONUS,
            lastDailyBonus: now,
            version: (wallet.version || 0) + 1,
        };
    });
    // Check if transaction was aborted
    if (!result.committed) {
        // Need to check why - either no wallet or on cooldown
        const walletSnap = await walletRef.once('value');
        const wallet = walletSnap.val();
        if (!wallet) {
            throw new functions.https.HttpsError('failed-precondition', 'Account not initialized. Call initializeNewUser first.');
        }
        const lastClaim = wallet.lastDailyBonus || 0;
        const nextClaimTime = lastClaim + COOLDOWN_MS;
        return {
            success: false,
            nextClaimTime,
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