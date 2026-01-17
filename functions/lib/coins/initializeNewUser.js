"use strict";
/**
 * Initialize New User
 *
 * Creates a wallet with starting coins for newly signed-in users.
 * Only works for authenticated users with Google/Facebook/Apple sign-in.
 * Anonymous users do NOT get coins (guest/demo mode).
 *
 * Security:
 * - Rejects anonymous auth (prevents account farming)
 * - Uses transaction to prevent double-initialization
 * - Checks if wallet already exists
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
exports.initializeNewUser = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.database();
// Starting coins for new signed-in users
const STARTING_COINS = 500;
// Allowed auth providers (not anonymous)
const ALLOWED_PROVIDERS = ['google.com', 'facebook.com', 'apple.com'];
exports.initializeNewUser = functions
    .region('europe-west1') // Same region as database
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in to initialize account');
    }
    const userId = context.auth.uid;
    const token = context.auth.token;
    // 2. Must NOT be anonymous - only signed-in users get coins
    const signInProvider = token.firebase?.sign_in_provider;
    if (signInProvider === 'anonymous') {
        throw new functions.https.HttpsError('permission-denied', 'Guest accounts do not have coin wallets. Sign in with Google, Facebook, or Apple to earn coins.');
    }
    // 3. Must be a valid provider (extra safety)
    // Note: Use generic error to prevent provider enumeration
    if (!ALLOWED_PROVIDERS.includes(signInProvider || '')) {
        throw new functions.https.HttpsError('permission-denied', 'Please sign in with Google, Facebook, or Apple to create a coin wallet.');
    }
    // 4. Use transaction to prevent race conditions
    const userRef = db.ref(`users/${userId}`);
    const result = await userRef.transaction((currentData) => {
        // If user data doesn't exist, create it
        if (currentData === null) {
            return {
                profile: {
                    displayName: token.name || 'Player',
                    flag: '',
                    createdAt: Date.now(),
                    provider: signInProvider,
                },
                wallet: {
                    coins: STARTING_COINS,
                    lifetimeEarnings: STARTING_COINS,
                    lifetimeSpent: 0,
                    lastDailyBonus: 0,
                    lastAdReward: 0,
                    adRewardsToday: 0,
                    version: 1,
                },
                progression: {
                    xp: 0,
                    level: 1,
                    gamesPlayed: 0,
                    gamesWon: 0,
                },
                streaks: {
                    currentWinStreak: 0,
                    bestWinStreak: 0,
                },
                transactions: {
                    [`init_${Date.now()}`]: {
                        type: 'bonus',
                        amount: STARTING_COINS,
                        description: 'Welcome bonus',
                        timestamp: Date.now(),
                        balanceAfter: STARTING_COINS,
                    },
                },
            };
        }
        // User already exists - check if wallet exists
        if (currentData.wallet) {
            // Wallet exists, abort transaction (return undefined)
            return; // This aborts the transaction
        }
        // User exists but no wallet (edge case) - add wallet
        return {
            ...currentData,
            wallet: {
                coins: STARTING_COINS,
                lifetimeEarnings: STARTING_COINS,
                lifetimeSpent: 0,
                lastDailyBonus: 0,
                lastAdReward: 0,
                adRewardsToday: 0,
                version: 1,
            },
            transactions: {
                ...(currentData.transactions || {}),
                [`init_${Date.now()}`]: {
                    type: 'bonus',
                    amount: STARTING_COINS,
                    description: 'Welcome bonus',
                    timestamp: Date.now(),
                    balanceAfter: STARTING_COINS,
                },
            },
        };
    });
    // Check transaction result
    if (!result.committed) {
        // Transaction was aborted - wallet already exists
        return {
            success: true,
            alreadyExists: true,
            coins: (await userRef.child('wallet/coins').once('value')).val(),
        };
    }
    // New wallet created
    console.log(`[initializeNewUser] Created wallet for ${userId} with ${STARTING_COINS} coins`);
    return {
        success: true,
        coins: STARTING_COINS,
        alreadyExists: false,
    };
});
//# sourceMappingURL=initializeNewUser.js.map