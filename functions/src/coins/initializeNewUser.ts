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

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.database();

// Starting coins for new signed-in users
const STARTING_COINS = 500;

// Allowed auth providers (not anonymous)
const ALLOWED_PROVIDERS = ['google.com', 'facebook.com', 'apple.com'];

interface InitializeResult {
  success: boolean;
  coins?: number;
  alreadyExists?: boolean;
  error?: string;
}

export const initializeNewUser = functions
  .region('europe-west1') // Same region as database
  .https.onCall(async (data, context): Promise<InitializeResult> => {
    console.log('[initializeNewUser] Function called');

    // 1. Must be authenticated
    if (!context.auth) {
      console.log('[initializeNewUser] No auth context');

      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in to initialize account'
      );
    }

    const userId = context.auth.uid;
    const token = context.auth.token;
    const signInProvider = token.firebase?.sign_in_provider;

    console.log('[initializeNewUser] User:', userId);
    console.log('[initializeNewUser] Provider:', signInProvider);

    // 2. Must NOT be anonymous - only signed-in users get coins
    if (signInProvider === 'anonymous') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Guest accounts do not have coin wallets. Sign in with Google, Facebook, or Apple to earn coins.'
      );
    }

    // 3. Must be a valid provider (extra safety)
    // Note: Use generic error to prevent provider enumeration
    if (!ALLOWED_PROVIDERS.includes(signInProvider || '')) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Please sign in with Google, Facebook, or Apple to create a coin wallet.'
      );
    }

    // 4. Use transaction to prevent race conditions
    console.log('[initializeNewUser] Starting transaction for user', userId);
    const userRef = db.ref(`users/${userId}`);

    const result = await userRef.transaction((currentData) => {
      console.log('[initializeNewUser] Transaction callback, data exists:', currentData !== null);
      // If user data doesn't exist, create it
      if (currentData === null) {
        console.log('[initializeNewUser] Creating new user data');
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
        console.log('[initializeNewUser] Wallet already exists, aborting');
        // Wallet exists, abort transaction (return undefined)
        return; // This aborts the transaction
      }
      console.log('[initializeNewUser] User exists but no wallet, adding wallet');

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

    console.log('[initializeNewUser] Transaction committed:', result.committed);

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
