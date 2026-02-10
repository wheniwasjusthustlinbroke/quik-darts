/**
 * refundEscrow — Integration Tests (Firebase Emulator)
 *
 * Tests real RTDB transactions: wallet credits, escrow status transitions,
 * concurrent refund prevention, cleanup batch, and the refundSingleEscrow helper.
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
  refundEscrow,
  refundSingleEscrow,
  cleanupExpiredEscrows,
} from '../../wagering/refundEscrow';

const wrappedRefund = testEnv.wrap(refundEscrow);
const wrappedCleanup = testEnv.wrap(cleanupExpiredEscrows);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const P1 = 'refund_p1';
const P2 = 'refund_p2';
const STAKE = 100;

function makePendingEscrow(player1Id: string, amount: number, expired = false) {
  const now = Date.now();
  return {
    player1: { userId: player1Id, amount, lockedAt: now - 60_000 },
    totalPot: amount,
    stakeLevel: amount,
    status: 'pending',
    createdAt: now - 60_000,
    expiresAt: expired ? now - 1000 : now + 300_000,
  };
}

function makeLockedEscrow(expired = false) {
  const now = Date.now();
  return {
    player1: { userId: P1, amount: STAKE, lockedAt: now - 60_000 },
    player2: { userId: P2, amount: STAKE, lockedAt: now - 30_000 },
    totalPot: STAKE * 2,
    stakeLevel: STAKE,
    status: 'locked',
    createdAt: now - 60_000,
    expiresAt: expired ? now - 1000 : now + 300_000,
  };
}

async function callRefund(data: Record<string, unknown>, uid: string) {
  return wrappedRefund(data, authContext(uid));
}

// ---------------------------------------------------------------------------
// Tests — refundEscrow (onCall)
// ---------------------------------------------------------------------------

describe('refundEscrow (integration)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  // --- Auth & validation ---

  it('rejects unauthenticated calls', async () => {
    await expect(wrappedRefund({ escrowId: 'esc1' }, {})).rejects.toThrow(/logged in/i);
  });

  it('rejects invalid escrowId', async () => {
    await expect(callRefund({ escrowId: '' }, P1)).rejects.toThrow(/Invalid escrow/i);
  });

  it('rejects non-participant', async () => {
    await seedEscrow('esc1', makePendingEscrow(P1, STAKE));
    await expect(callRefund({ escrowId: 'esc1' }, 'stranger'))
      .rejects.toThrow(/not a participant/i);
  });

  // --- Status checks ---

  it('rejects refund on locked non-expired escrow', async () => {
    await seedEscrow('esc1', makeLockedEscrow(false));
    await expect(callRefund({ escrowId: 'esc1' }, P1))
      .rejects.toThrow(/Cannot refund a locked escrow/i);
  });

  it('returns success for already-refunded escrow', async () => {
    await seedEscrow('esc1', { ...makePendingEscrow(P1, STAKE), status: 'refunded' });
    const result = await callRefund({ escrowId: 'esc1' }, P1);
    expect(result.success).toBe(true);
    expect(result.error).toMatch(/already refunded/i);
  });

  it('returns success for already-released escrow', async () => {
    await seedEscrow('esc1', { ...makePendingEscrow(P1, STAKE), status: 'released' });
    const result = await callRefund({ escrowId: 'esc1' }, P1);
    expect(result.success).toBe(true);
    expect(result.error).toMatch(/already released/i);
  });

  // --- Pending refund ---

  it('refunds pending escrow and credits wallet', async () => {
    await seedUser(P1, { coins: 0, lifetimeSpent: STAKE });
    await seedEscrow('esc1', makePendingEscrow(P1, STAKE));

    const result = await callRefund({ escrowId: 'esc1', reason: 'cancelled' }, P1);

    expect(result.success).toBe(true);
    expect(result.refundedPlayers).toContain(P1);
    expect(result.refundedAmounts).toContain(STAKE);

    // Verify wallet
    const wallet = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    expect(wallet!.coins).toBe(STAKE);
    expect(wallet!.lifetimeSpent).toBe(0);

    // Verify escrow status
    const escrow = await readPath<Record<string, unknown>>(PATHS.escrow('esc1'));
    expect(escrow!.status).toBe('refunded');
    expect(escrow!.refundReason).toBe('cancelled');

    // Verify transaction logged
    const txns = await readPath<Record<string, unknown>>(PATHS.transactions(P1));
    expect(txns).not.toBeNull();
    const txnValues = Object.values(txns!);
    expect(txnValues.some((t: any) => t.type === 'refund')).toBe(true);
  });

  // --- Expired locked refund ---

  it('refunds expired locked escrow with both players', async () => {
    await seedUser(P1, { coins: 0, lifetimeSpent: STAKE });
    await seedUser(P2, { coins: 0, lifetimeSpent: STAKE });
    await seedEscrow('esc1', makeLockedEscrow(true)); // expired

    const result = await callRefund({ escrowId: 'esc1' }, P1);

    expect(result.success).toBe(true);
    expect(result.refundedPlayers).toContain(P1);
    expect(result.refundedPlayers).toContain(P2);

    // Both wallets credited
    const w1 = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    const w2 = await readPath<Record<string, unknown>>(PATHS.wallet(P2));
    expect(w1!.coins).toBe(STAKE);
    expect(w2!.coins).toBe(STAKE);
  });

  // --- Double-refund prevention ---

  it('prevents double-refund on concurrent calls', async () => {
    await seedUser(P1, { coins: 0, lifetimeSpent: STAKE });
    await seedEscrow('esc1', makePendingEscrow(P1, STAKE));

    // Fire two refunds concurrently
    const [r1, r2] = await Promise.all([
      callRefund({ escrowId: 'esc1' }, P1),
      callRefund({ escrowId: 'esc1' }, P1),
    ]);

    // Both should succeed (idempotent)
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    // Wallet should have exactly STAKE (not 2×STAKE)
    const wallet = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    expect(wallet!.coins).toBe(STAKE);
  });

  // --- cleanup_pending mode ---

  it('cleanup_pending refunds all pending escrows for user', async () => {
    await seedUser(P1, { coins: 0, lifetimeSpent: STAKE * 2 });
    await seedEscrow('esc_a', makePendingEscrow(P1, STAKE));
    await seedEscrow('esc_b', makePendingEscrow(P1, STAKE));

    const result = await callRefund({ escrowId: 'cleanup_pending' }, P1);

    expect(result.success).toBe(true);

    // Both escrows refunded
    const ea = await readPath<Record<string, unknown>>(PATHS.escrow('esc_a'));
    const eb = await readPath<Record<string, unknown>>(PATHS.escrow('esc_b'));
    expect(ea!.status).toBe('refunded');
    expect(eb!.status).toBe('refunded');

    // Wallet credited for both
    const wallet = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    expect(wallet!.coins).toBe(STAKE * 2);
  });
});

// ---------------------------------------------------------------------------
// Tests — refundSingleEscrow (exported helper)
// ---------------------------------------------------------------------------

describe('refundSingleEscrow (integration)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('refunds pending escrow and returns player info', async () => {
    await seedUser(P1, { coins: 0, lifetimeSpent: STAKE });
    await seedEscrow('esc1', makePendingEscrow(P1, STAKE));

    const result = await refundSingleEscrow('esc1', 'test_reason');

    expect(result).not.toBeNull();
    expect(result!.refundedPlayers).toContain(P1);
    expect(result!.refundedAmounts).toContain(STAKE);

    const escrow = await readPath<Record<string, unknown>>(PATHS.escrow('esc1'));
    expect(escrow!.status).toBe('refunded');
  });

  it('returns null for non-existent escrow', async () => {
    const result = await refundSingleEscrow('nonexistent', 'test');
    expect(result).toBeNull();
  });

  it('is idempotent — second call returns null', async () => {
    await seedUser(P1, { coins: 0, lifetimeSpent: STAKE });
    await seedEscrow('esc1', makePendingEscrow(P1, STAKE));

    const r1 = await refundSingleEscrow('esc1', 'first');
    expect(r1).not.toBeNull();

    const r2 = await refundSingleEscrow('esc1', 'second');
    expect(r2).toBeNull();

    // Wallet credited only once
    const wallet = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    expect(wallet!.coins).toBe(STAKE);
  });

  it('skips terminal states (released)', async () => {
    await seedEscrow('esc1', {
      ...makePendingEscrow(P1, STAKE),
      status: 'released',
    });

    const result = await refundSingleEscrow('esc1', 'test');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — cleanupExpiredEscrows (scheduled)
// ---------------------------------------------------------------------------

describe('cleanupExpiredEscrows (integration)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('refunds expired pending and locked escrows', async () => {
    await seedUser(P1, { coins: 0, lifetimeSpent: STAKE * 2 });
    await seedUser(P2, { coins: 0, lifetimeSpent: STAKE });

    // Expired pending (player1 only)
    await seedEscrow('exp_pending', makePendingEscrow(P1, STAKE, true));

    // Expired locked (both players)
    await seedEscrow('exp_locked', makeLockedEscrow(true));

    await wrappedCleanup({});

    // Both should be refunded
    const ep = await readPath<Record<string, unknown>>(PATHS.escrow('exp_pending'));
    expect(ep!.status).toBe('refunded');

    const el = await readPath<Record<string, unknown>>(PATHS.escrow('exp_locked'));
    expect(el!.status).toBe('refunded');

    // Wallets credited appropriately
    const w1 = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    // P1 gets STAKE from pending + STAKE from locked = STAKE * 2
    expect(w1!.coins).toBe(STAKE * 2);

    const w2 = await readPath<Record<string, unknown>>(PATHS.wallet(P2));
    expect(w2!.coins).toBe(STAKE);
  });

  it('skips already-processed escrows', async () => {
    await seedEscrow('already_done', {
      ...makePendingEscrow(P1, STAKE, true),
      status: 'refunded',
    });

    await wrappedCleanup({});

    // Status unchanged
    const escrow = await readPath<Record<string, unknown>>(PATHS.escrow('already_done'));
    expect(escrow!.status).toBe('refunded');
  });

  it('handles empty database gracefully', async () => {
    // No escrows seeded — should not throw
    await wrappedCleanup({});
  });
});
