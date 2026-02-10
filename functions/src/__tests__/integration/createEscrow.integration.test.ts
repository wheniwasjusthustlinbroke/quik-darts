/**
 * createEscrow — Integration Tests (Firebase Emulator)
 *
 * Tests real RTDB transactions against the database emulator:
 * wallet deductions, escrow creation, joining, rate limiting,
 * duplicate prevention, and expired-escrow auto-refund.
 *
 * Run with:  npm run test:emulator
 */

import {
  testEnv,
  clearDatabase,
  seedUser,
  seedEscrow,
  readPath,
  authContext,
  PATHS,
} from './helpers/emulatorSetup';

import {
  createEscrow,
  VALID_STAKES,
  MAX_ESCROWS_PER_HOUR,
  ESCROW_EXPIRY_MS,
} from '../../wagering/createEscrow';

// Wrap the Cloud Function for direct invocation
const wrapped = testEnv.wrap(createEscrow);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const P1 = 'integ_p1';
const P2 = 'integ_p2';
const INITIAL_COINS = 10_000;

async function callCreate(
  data: Record<string, unknown>,
  uid: string,
  options?: { anonymous?: boolean },
) {
  return wrapped(data, authContext(uid, options));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEscrow (integration)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  // --- Auth ---

  it('rejects unauthenticated calls', async () => {
    await expect(wrapped({ stakeAmount: VALID_STAKES[0] }, {}))
      .rejects.toThrow(/logged in/i);
  });

  it('rejects anonymous users', async () => {
    await seedUser(P1, { coins: INITIAL_COINS });
    await expect(callCreate({ stakeAmount: VALID_STAKES[0] }, P1, { anonymous: true }))
      .rejects.toThrow(/signed-in account/i);
  });

  // --- Validation ---

  it('rejects invalid stake amount', async () => {
    await seedUser(P1, { coins: INITIAL_COINS });
    await expect(callCreate({ stakeAmount: 999 }, P1))
      .rejects.toThrow(/Invalid stake/i);
  });

  it('accepts all valid stakes', async () => {
    for (const stake of VALID_STAKES) {
      await clearDatabase();
      await seedUser(P1, { coins: INITIAL_COINS });

      const result = await callCreate({ stakeAmount: stake }, P1);
      expect(result.success).toBe(true);
      expect(result.escrowStatus).toBe('pending');
    }
  });

  // --- Create flow ---

  it('creates escrow with correct structure and deducts wallet', async () => {
    await seedUser(P1, { coins: INITIAL_COINS });
    const stake = VALID_STAKES[0];

    const result = await callCreate({ stakeAmount: stake }, P1);

    expect(result.success).toBe(true);
    expect(result.escrowId).toBeDefined();
    expect(result.escrowStatus).toBe('pending');
    expect(result.totalPot).toBe(stake);
    expect(result.newBalance).toBe(INITIAL_COINS - stake);

    // Verify escrow in RTDB
    const escrow = await readPath<Record<string, unknown>>(PATHS.escrow(result.escrowId!));
    expect(escrow).not.toBeNull();
    expect(escrow!.status).toBe('pending');
    expect(escrow!.stakeLevel).toBe(stake);
    expect((escrow!.player1 as any).userId).toBe(P1);
    expect((escrow!.player1 as any).amount).toBe(stake);

    // Verify wallet deducted
    const wallet = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    expect(wallet!.coins).toBe(INITIAL_COINS - stake);
  });

  // --- Insufficient balance ---

  it('rejects when wallet has insufficient coins', async () => {
    const stake = VALID_STAKES[0];
    await seedUser(P1, { coins: stake - 1 });

    const result = await callCreate({ stakeAmount: stake }, P1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Insufficient/i);

    // Wallet unchanged
    const wallet = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    expect(wallet!.coins).toBe(stake - 1);
  });

  // --- Join flow ---

  it('player2 joins and escrow transitions to locked', async () => {
    const stake = VALID_STAKES[0];
    await seedUser(P1, { coins: INITIAL_COINS });
    await seedUser(P2, { coins: INITIAL_COINS });

    // P1 creates
    const createResult = await callCreate({ stakeAmount: stake }, P1);
    const escrowId = createResult.escrowId!;

    // P2 joins
    const joinResult = await callCreate({ escrowId, stakeAmount: stake }, P2);

    expect(joinResult.success).toBe(true);
    expect(joinResult.escrowStatus).toBe('locked');
    expect(joinResult.totalPot).toBe(stake * 2);

    // Verify both wallets deducted
    const w1 = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    const w2 = await readPath<Record<string, unknown>>(PATHS.wallet(P2));
    expect(w1!.coins).toBe(INITIAL_COINS - stake);
    expect(w2!.coins).toBe(INITIAL_COINS - stake);

    // Verify escrow has both players
    const escrow = await readPath<Record<string, unknown>>(PATHS.escrow(escrowId));
    expect(escrow!.status).toBe('locked');
    expect((escrow!.player2 as any).userId).toBe(P2);
  });

  it('rejects joining own escrow', async () => {
    const stake = VALID_STAKES[0];
    await seedUser(P1, { coins: INITIAL_COINS });

    const createResult = await callCreate({ stakeAmount: stake }, P1);

    // P1 tries to join own escrow — root transaction aborts
    await expect(callCreate({ escrowId: createResult.escrowId, stakeAmount: stake }, P1))
      .rejects.toThrow();
  });

  it('rejects stake mismatch when joining', async () => {
    await seedUser(P1, { coins: INITIAL_COINS });
    await seedUser(P2, { coins: INITIAL_COINS });

    const createResult = await callCreate({ stakeAmount: VALID_STAKES[0] }, P1);

    // P2 joins with different stake
    await expect(
      callCreate({ escrowId: createResult.escrowId, stakeAmount: VALID_STAKES[1] }, P2),
    ).rejects.toThrow();
  });

  // --- Duplicate pending ---

  it('rejects when user already has a pending escrow', async () => {
    const stake = VALID_STAKES[0];
    await seedUser(P1, { coins: INITIAL_COINS });

    await callCreate({ stakeAmount: stake }, P1);

    // Second create should fail
    await expect(callCreate({ stakeAmount: stake }, P1))
      .rejects.toThrow(/pending match/i);
  });

  // --- Auto-refund expired pending ---

  it('auto-refunds expired pending escrow on new create', async () => {
    const stake = VALID_STAKES[0];
    await seedUser(P1, { coins: INITIAL_COINS });

    // Seed an expired pending escrow directly
    const expiredId = 'expired_escrow_1';
    await seedEscrow(expiredId, {
      player1: { userId: P1, amount: stake, lockedAt: Date.now() - ESCROW_EXPIRY_MS - 1000 },
      totalPot: stake,
      stakeLevel: stake,
      status: 'pending',
      createdAt: Date.now() - ESCROW_EXPIRY_MS - 1000,
      expiresAt: Date.now() - 1000, // Expired 1 second ago
    });

    // Deduct the stake from wallet (simulating it was taken when escrow was created)
    const walletAfterFirst = INITIAL_COINS - stake;
    await seedUser(P1, { coins: walletAfterFirst });

    // New create should succeed (auto-refunds expired one first)
    const result = await callCreate({ stakeAmount: stake }, P1);
    expect(result.success).toBe(true);

    // Old escrow should be refunded
    const oldEscrow = await readPath<Record<string, unknown>>(PATHS.escrow(expiredId));
    expect(oldEscrow!.status).toBe('refunded');
  });

  // --- Rate limiting ---

  it('enforces rate limit after MAX_ESCROWS_PER_HOUR calls', async () => {
    const stake = VALID_STAKES[0];

    for (let i = 0; i < MAX_ESCROWS_PER_HOUR; i++) {
      await clearDatabase();
      await seedUser(P1, { coins: INITIAL_COINS });
      // Rate limits persist across clearDatabase since they're under escrowRateLimits
      // — actually clearDatabase wipes everything, so we need to preserve rate limit data.
      // Let's just create up to the limit in sequence without clearing:
    }

    // Reset and create up to the limit
    await clearDatabase();
    await seedUser(P1, { coins: INITIAL_COINS * MAX_ESCROWS_PER_HOUR });

    for (let i = 0; i < MAX_ESCROWS_PER_HOUR; i++) {
      // Each iteration: create escrow, then "refund" it so user doesn't have pending
      const result = await callCreate({ stakeAmount: stake }, P1);
      expect(result.success).toBe(true);

      // Mark escrow as refunded so the pending check doesn't block the next create
      if (result.escrowId) {
        await seedEscrow(result.escrowId, {
          status: 'refunded',
          player1: { userId: P1, amount: stake },
        });
        // Restore wallet for next iteration
        const current = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
        await seedUser(P1, { coins: (current?.coins as number ?? 0) + stake });
      }
    }

    // Next call should be rate limited
    await expect(callCreate({ stakeAmount: stake }, P1))
      .rejects.toThrow(/Too many/i);
  });

  // --- EscrowId validation ---

  it('validates escrowId format for joins', async () => {
    await seedUser(P1, { coins: INITIAL_COINS });
    await expect(callCreate({ escrowId: '../invalid/path', stakeAmount: VALID_STAKES[0] }, P1))
      .rejects.toThrow(/Invalid escrow ID/i);
  });
});
