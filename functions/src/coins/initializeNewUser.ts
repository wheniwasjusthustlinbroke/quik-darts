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
import { sanitizeDisplayName } from '../utils/sanitizeName';

const db = admin.database();

// Starting coins for new signed-in users
const STARTING_COINS = 500;

// Allowed auth providers (not anonymous)
const ALLOWED_PROVIDERS = ['google.com', 'facebook.com', 'apple.com'];

// Generate a unique player ID in format XXX-XXX-XXX-X
function generateUniqueId(): string {
  const segments: string[] = [];
  for (let i = 0; i < 3; i++) {
    segments.push(Math.floor(Math.random() * 1000).toString().padStart(3, '0'));
  }
  const checkDigit = Math.floor(Math.random() * 10).toString();
  return `${segments.join('-')}-${checkDigit}`;
}

interface InitializeResult {
  success: boolean;
  coins?: number;
  alreadyExists?: boolean;
  error?: string;
}

export const initializeNewUser = functions
  .region('europe-west1') // Same region as database
  .https.onCall(async (data, context): Promise<InitializeResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in to initialize account'
      );
    }

    const userId = context.auth.uid;
    const token = context.auth.token;
    const signInProvider = token.firebase?.sign_in_provider;

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
    const userRef = db.ref(`users/${userId}`);

    const result = await userRef.transaction((currentData) => {
      // If user data doesn't exist, create it
      if (currentData === null) {
        return {
          profile: {
            displayName: sanitizeDisplayName(token.name),
            flag: '',
            uniqueId: generateUniqueId(),
            avatar: 'default',
            createdAt: Date.now(),
            provider: signInProvider,
          },
          wallet: {
            coins: STARTING_COINS,
            lifetimeEarnings: STARTING_COINS,
            lifetimeSpent: 0,
            lastDailyBonus: 0,
            dailyBonusTimezone: '', // Set on first daily bonus claim (server-pinned)
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
          stats: {
            total180s: 0,
            totalBullseyes: 0,
            totalTriples: 0,
            totalDoubles: 0,
            highestCheckout: 0,
            perfectLegs: 0,
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
          dailyBonusTimezone: '', // Set on first daily bonus claim (server-pinned)
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
    console.log(`[initializeNewUser] New user wallet created`);

    return {
      success: true,
      coins: STARTING_COINS,
      alreadyExists: false,
    };
  });
