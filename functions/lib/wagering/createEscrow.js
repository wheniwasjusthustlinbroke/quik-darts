"use strict";
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
exports.createEscrow = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.database();
// Valid stake amounts
const VALID_STAKES = [50, 100, 500, 2500];
// Escrow expiration (30 minutes)
const ESCROW_EXPIRY_MS = 30 * 60 * 1000;
exports.createEscrow = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const userId = context.auth.uid;
    const token = context.auth.token;
    // 2. Must NOT be anonymous (only signed-in users can wager)
    if (token.firebase?.sign_in_provider === 'anonymous') {
        throw new functions.https.HttpsError('permission-denied', 'Wagered matches require a signed-in account. Please sign in with Google, Facebook, or Apple.');
    }
    // 3. Validate stake amount
    const { escrowId, stakeAmount } = data;
    if (!VALID_STAKES.includes(stakeAmount)) {
        throw new functions.https.HttpsError('invalid-argument', `Invalid stake amount. Valid stakes: ${VALID_STAKES.join(', ')}`);
    }
    if (!escrowId || typeof escrowId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid escrow ID');
    }
    const now = Date.now();
    const walletRef = db.ref(`users/${userId}/wallet`);
    const escrowRef = db.ref(`escrow/${escrowId}`);
    // 4. Check if user already has pending escrow (prevent joining multiple games)
    const pendingEscrowSnap = await db.ref('escrow')
        .orderByChild('status')
        .equalTo('pending')
        .once('value');
    const pendingEscrows = pendingEscrowSnap.val();
    if (pendingEscrows) {
        for (const [, escrow] of Object.entries(pendingEscrows)) {
            if (escrow.player1?.userId === userId || escrow.player2?.userId === userId) {
                // Check if it's expired
                if (escrow.expiresAt && escrow.expiresAt < now) {
                    // Expired - clean it up (will be handled by refund job)
                    continue;
                }
                throw new functions.https.HttpsError('failed-precondition', 'You already have a pending match. Complete or cancel it first.');
            }
        }
    }
    // 5. Atomic transaction: deduct from wallet and create/update escrow
    const result = await db.ref().transaction((root) => {
        if (!root)
            return root;
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
        }
        else {
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
        if (!root.escrow)
            root.escrow = {};
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
            throw new functions.https.HttpsError('failed-precondition', 'Account not initialized. Please sign in first.');
        }
        if ((wallet.coins || 0) < stakeAmount) {
            return {
                success: false,
                error: `Insufficient coins. You have ${wallet.coins || 0}, need ${stakeAmount}.`,
            };
        }
        throw new functions.https.HttpsError('aborted', 'Transaction failed. Please try again.');
    }
    // 7. Get final escrow state
    const finalEscrowSnap = await escrowRef.once('value');
    const finalEscrow = finalEscrowSnap.val();
    const finalWalletSnap = await walletRef.once('value');
    const finalWallet = finalWalletSnap.val();
    console.log(`[createEscrow] User ${userId} locked ${stakeAmount} coins in escrow ${escrowId}. Status: ${finalEscrow.status}`);
    return {
        success: true,
        escrowId,
        escrowStatus: finalEscrow.status,
        totalPot: finalEscrow.totalPot,
        newBalance: finalWallet?.coins || 0,
    };
});
//# sourceMappingURL=createEscrow.js.map