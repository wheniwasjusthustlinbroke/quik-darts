/**
 * Create Escrow
 *
 * Locks coins from a player's wallet into escrow for a wagered match.
 * Both players must call this before the game starts.
 *
 * Security:
 * - Rejects anonymous users
 * - Verifies sufficient balance
 * - Uses atomic transaction to prevent race conditions
 * - Prevents joining multiple games simultaneously
 * - 30-minute expiration for abandoned escrows
 * - Rate limited: max 5 escrows per user per hour (prevents lockup attacks)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { refundSingleEscrow } from './refundEscrow';

const db = admin.database();

// Valid stake amounts
export const VALID_STAKES = [50, 100, 500, 2500] as const;
type StakeLevel = typeof VALID_STAKES[number];

// Escrow expiration (30 minutes)
export const ESCROW_EXPIRY_MS = 30 * 60 * 1000;

// Rate limiting: max escrows per user in time window
export const MAX_ESCROWS_PER_HOUR = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface CreateEscrowRequest {
  escrowId?: string; // Optional: if provided, join existing escrow. If not, server generates secure ID.
  stakeAmount: number;
  opponentId?: string; // Optional: known opponent
}

interface CreateEscrowResult {
  success: boolean;
  escrowId?: string;
  escrowStatus?: 'pending' | 'locked';
  totalPot?: number;
  newBalance?: number;
  error?: string;
}

export const createEscrow = functions
  .region('europe-west1')
  .https.onCall(async (data: CreateEscrowRequest, context): Promise<CreateEscrowResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in'
      );
    }

    const userId = context.auth.uid;
    const token = context.auth.token;

    // 2. Must NOT be anonymous (only signed-in users can wager)
    if (token.firebase?.sign_in_provider === 'anonymous') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Wagered matches require a signed-in account. Please sign in with Google, Facebook, or Apple.'
      );
    }

    // 3. Validate stake amount
    const { stakeAmount } = data;
    let { escrowId } = data;

    if (!VALID_STAKES.includes(stakeAmount as StakeLevel)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid stake amount. Valid stakes: ${VALID_STAKES.join(', ')}`
      );
    }

    const now = Date.now();
    const isJoiningExisting = !!escrowId;

    // SECURITY: Rate limiting - prevent escrow lockup and spam attacks
    // Users can only create OR JOIN a limited number of escrows per hour
    // (Rate limit applies to both create and join to prevent abuse)
    const rateLimitRef = db.ref(`escrowRateLimits/${userId}`);
    const rateLimitResult = await rateLimitRef.transaction((rateLimit) => {
      if (!rateLimit) {
        // First escrow - initialize rate limit tracking
        return {
          count: 1,
          windowStart: now,
        };
      }

      // Check if we're in a new window
      if (now - rateLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
        // New window - reset count
        return {
          count: 1,
          windowStart: now,
        };
      }

      // Same window - check limit
      if (rateLimit.count >= MAX_ESCROWS_PER_HOUR) {
        return; // Abort - rate limit exceeded
      }

      // Increment count
      return {
        count: rateLimit.count + 1,
        windowStart: rateLimit.windowStart,
      };
    });

    if (!rateLimitResult.committed) {
      console.warn(`[createEscrow] Rate limit exceeded for user ${userId} (${isJoiningExisting ? 'join' : 'create'})`);
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Too many wagered matches. You can create or join up to ${MAX_ESCROWS_PER_HOUR} matches per hour. Please try again later.`
      );
    }

    console.log(`[createEscrow] Rate limit check passed: ${rateLimitResult.snapshot.val()?.count}/${MAX_ESCROWS_PER_HOUR} (${isJoiningExisting ? 'join' : 'create'})`)

    // SECURITY: If escrowId is provided (joining existing), validate format
    // If not provided (creating new), generate a cryptographically secure ID server-side
    if (isJoiningExisting) {
      // Validate escrowId format to prevent injection/DoS attacks
      if (typeof escrowId !== 'string' || escrowId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(escrowId)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid escrow ID format. Must be alphanumeric with underscores or hyphens, max 100 characters.'
        );
      }
    } else {
      // Generate cryptographically secure escrowId using Firebase push key
      // This prevents ID enumeration and collision attacks
      escrowId = db.ref('escrow').push().key!;
      console.log(`[createEscrow] Generated server-side escrow ID`);
    }

    const walletRef = db.ref(`users/${userId}/wallet`);
    const escrowRef = db.ref(`escrow/${escrowId}`);

    // 4. Check if user already has pending escrow (prevent joining multiple games)
    const pendingEscrowSnap = await db.ref('escrow')
      .orderByChild('status')
      .equalTo('pending')
      .once('value');

    const pendingEscrows = pendingEscrowSnap.val();
    if (pendingEscrows) {
      for (const [pendingEscrowId, escrow] of Object.entries(pendingEscrows as Record<string, any>)) {
        if (escrow.player1?.userId === userId || escrow.player2?.userId === userId) {
          // Check if it's expired
          if (escrow.expiresAt && escrow.expiresAt < now) {
            // Expired — fully refund via shared helper (status + wallet credits)
            await refundSingleEscrow(pendingEscrowId, 'expired_at_create');
            continue;
          }
          throw new functions.https.HttpsError(
            'failed-precondition',
            'You already have a pending match. Complete or cancel it first.'
          );
        }
      }
    }

    // 5. Atomic transaction: deduct from wallet and create/update escrow
    const result = await db.ref().transaction((root) => {
      if (!root) return root;

      // Get wallet
      const wallet = root.users?.[userId]?.wallet;
      if (!wallet) {
        return; // Abort - no wallet
      }

      // Check balance
      if ((wallet.coins || 0) < stakeAmount) {
        return; // Abort - insufficient funds
      }

      // Get or create escrow
      let escrow = root.escrow?.[escrowId];
      const isNewEscrow = !escrow;

      if (isNewEscrow) {
        // Create new escrow
        escrow = {
          player1: {
            userId,
            amount: stakeAmount,
            lockedAt: now,
          },
          totalPot: stakeAmount,
          stakeLevel: stakeAmount,
          status: 'pending',
          createdAt: now,
          expiresAt: now + ESCROW_EXPIRY_MS,
        };
      } else {
        // Join existing escrow
        if (escrow.status !== 'pending') {
          return; // Abort - escrow already locked or released
        }

        if (escrow.player1?.userId === userId) {
          return; // Abort - already in this escrow
        }

        if (escrow.stakeLevel !== stakeAmount) {
          return; // Abort - stake mismatch
        }

        // Add as player2
        escrow.player2 = {
          userId,
          amount: stakeAmount,
          lockedAt: now,
        };
        escrow.totalPot = (escrow.totalPot || 0) + stakeAmount;
        escrow.status = 'locked'; // Both players in, lock the escrow
      }

      // Deduct from wallet
      root.users[userId].wallet.coins = (wallet.coins || 0) - stakeAmount;
      root.users[userId].wallet.lifetimeSpent = (wallet.lifetimeSpent || 0) + stakeAmount;
      root.users[userId].wallet.version = (wallet.version || 0) + 1;

      // Update escrow
      if (!root.escrow) root.escrow = {};
      root.escrow[escrowId] = escrow;

      // Log transaction
      if (!root.users[userId].transactions) {
        root.users[userId].transactions = {};
      }
      root.users[userId].transactions[`wager_${now}`] = {
        type: 'wager',
        amount: -stakeAmount,
        escrowId,
        description: `Wagered ${stakeAmount} coins`,
        timestamp: now,
        balanceAfter: root.users[userId].wallet.coins,
      };

      return root;
    });

    // 6. Check transaction result
    if (!result.committed) {
      // Determine why it failed
      const walletSnap = await walletRef.once('value');
      const wallet = walletSnap.val();

      if (!wallet) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Account not initialized. Please sign in first.'
        );
      }

      if ((wallet.coins || 0) < stakeAmount) {
        return {
          success: false,
          error: 'Insufficient coins for this stake level.',
        };
      }

      throw new functions.https.HttpsError(
        'aborted',
        'Transaction failed. Please try again.'
      );
    }

    // 7. Get final escrow state
    const finalEscrowSnap = await escrowRef.once('value');
    const finalEscrow = finalEscrowSnap.val();

    const finalWalletSnap = await walletRef.once('value');
    const finalWallet = finalWalletSnap.val();

    console.log(`[createEscrow] Escrow created/joined. Status: ${finalEscrow.status}`);

    return {
      success: true,
      escrowId,
      escrowStatus: finalEscrow.status,
      totalPot: finalEscrow.totalPot,
      newBalance: finalWallet?.coins || 0,
    };
  });
