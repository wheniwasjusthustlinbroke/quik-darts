/**
 * settleGame — Integration Tests (Firebase Emulator)
 *
 * Tests real RTDB transactions: payout to winner, escrow state machine,
 * double-settlement prevention, XP awards, and level-up bonus coins.
 *
 * Run with:  npm run test:emulator
 */

import {
  testEnv,
  db,
  clearDatabase,
  seedUser,
  seedEscrow,
  seedGame,
  seedProgression,
  readPath,
  authContext,
  PATHS,
} from './helpers/emulatorSetup';

import { settleGame } from '../../wagering/settleGame';
import { XP_REWARDS } from '../../utils/levelSystem';

const wrapped = testEnv.wrap(settleGame);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const P1 = 'settle_p1';
const P2 = 'settle_p2';
const STAKE = 100;
const POT = STAKE * 2;

function makeFinishedGame(winner: 0 | 1, escrowId: string) {
  return {
    player1: { id: P1, score: winner === 0 ? 0 : 100 },
    player2: { id: P2, score: winner === 1 ? 0 : 100 },
    status: 'finished',
    winner,
    wager: { stakeAmount: STAKE, escrowId, settled: false },
    wagerAmount: STAKE,
  };
}

function makeLockedEscrow() {
  return {
    player1: { userId: P1, amount: STAKE },
    player2: { userId: P2, amount: STAKE },
    totalPot: POT,
    stakeLevel: STAKE,
    status: 'locked',
    createdAt: Date.now() - 60_000,
    expiresAt: Date.now() + 300_000,
  };
}

async function callSettle(gameId: string, uid: string) {
  return wrapped({ gameId }, authContext(uid));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settleGame (integration)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  // --- Auth & validation ---

  it('rejects unauthenticated calls', async () => {
    await expect(wrapped({ gameId: 'g1' }, {})).rejects.toThrow(/logged in/i);
  });

  it('rejects invalid gameId', async () => {
    await expect(callSettle('', P1)).rejects.toThrow(/Invalid game/i);
  });

  it('rejects non-participant', async () => {
    await seedGame('g1', makeFinishedGame(0, 'esc1'));
    await expect(callSettle('g1', 'stranger')).rejects.toThrow(/not a player/i);
  });

  it('rejects unfinished game', async () => {
    await seedGame('g1', { ...makeFinishedGame(0, 'esc1'), status: 'playing' });
    await expect(callSettle('g1', P1)).rejects.toThrow(/not finished/i);
  });

  it('rejects game with no winner', async () => {
    await seedGame('g1', { ...makeFinishedGame(0, 'esc1'), winner: null });
    await expect(callSettle('g1', P1)).rejects.toThrow(/no winner/i);
  });

  // --- Idempotent ---

  it('returns success for already settled game', async () => {
    await seedGame('g1', {
      ...makeFinishedGame(0, 'esc1'),
      wager: { stakeAmount: STAKE, escrowId: 'esc1', settled: true },
    });

    const result = await callSettle('g1', P1);
    expect(result.success).toBe(true);
    expect(result.error).toMatch(/Already settled/i);
  });

  // --- Payout ---

  it('pays winner full pot and transitions escrow to released', async () => {
    await seedUser(P1, { coins: 0 });
    await seedUser(P2, { coins: 0 });
    await seedProgression(P1, { xp: 0, level: 1 });
    await seedProgression(P2, { xp: 0, level: 1 });
    await seedEscrow('esc1', makeLockedEscrow());
    await seedGame('g1', makeFinishedGame(0, 'esc1'));

    const result = await callSettle('g1', P1);

    expect(result.success).toBe(true);
    expect(result.winnerId).toBe(P1);
    expect(result.payout).toBe(POT);

    // Winner wallet credited
    const w1 = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    expect(w1!.coins).toBe(POT);
    expect(w1!.lifetimeEarnings).toBe(POT);

    // Escrow released
    const escrow = await readPath<Record<string, unknown>>(PATHS.escrow('esc1'));
    expect(escrow!.status).toBe('released');
    expect(escrow!.payoutAwarded).toBe(true);

    // Game marked settled
    const settled = await readPath(PATHS.gameSettled('g1'));
    expect(settled).toBe(true);
  });

  // --- Double-settlement prevention ---

  it('prevents double-settlement (second call does not double-award)', async () => {
    await seedUser(P1, { coins: 0 });
    await seedUser(P2, { coins: 0 });
    await seedProgression(P1, { xp: 0, level: 1 });
    await seedProgression(P2, { xp: 0, level: 1 });
    await seedEscrow('esc1', makeLockedEscrow());
    await seedGame('g1', makeFinishedGame(0, 'esc1'));

    // First settlement
    const r1 = await callSettle('g1', P1);
    expect(r1.success).toBe(true);
    expect(r1.payout).toBe(POT);

    // Second settlement — should not double-award
    const r2 = await callSettle('g1', P2);
    expect(r2.success).toBe(true);

    // Winner wallet should still have exactly POT (not 2×POT)
    const w1 = await readPath<Record<string, unknown>>(PATHS.wallet(P1));
    expect(w1!.coins).toBe(POT);
  });

  // --- XP ---

  it('awards XP to both players', async () => {
    await seedUser(P1, { coins: 0 });
    await seedUser(P2, { coins: 0 });
    await seedProgression(P1, { xp: 0, level: 1 });
    await seedProgression(P2, { xp: 0, level: 1 });
    await seedEscrow('esc1', makeLockedEscrow());
    await seedGame('g1', makeFinishedGame(0, 'esc1'));

    const result = await callSettle('g1', P1);

    expect(result.xpAwarded).toBeDefined();
    const winnerXP = XP_REWARDS.GAME_PLAYED + XP_REWARDS.GAME_WON + XP_REWARDS.GAME_WON_WAGERED;
    const loserXP = XP_REWARDS.GAME_PLAYED;
    expect(result.xpAwarded!.winner).toBe(winnerXP);
    expect(result.xpAwarded!.loser).toBe(loserXP);

    // Verify in RTDB
    const prog1 = await readPath<Record<string, unknown>>(PATHS.progression(P1));
    expect(prog1!.xp).toBe(winnerXP);
    const prog2 = await readPath<Record<string, unknown>>(PATHS.progression(P2));
    expect(prog2!.xp).toBe(loserXP);
  });

  // --- Progression stats ---

  it('updates gamesPlayed and gamesWon for both players', async () => {
    await seedUser(P1, { coins: 0 });
    await seedUser(P2, { coins: 0 });
    await seedProgression(P1, { xp: 0, level: 1, gamesPlayed: 5, gamesWon: 3 });
    await seedProgression(P2, { xp: 0, level: 1, gamesPlayed: 5, gamesWon: 2 });
    await seedEscrow('esc1', makeLockedEscrow());
    await seedGame('g1', makeFinishedGame(0, 'esc1'));

    await callSettle('g1', P1);

    const prog1 = await readPath<Record<string, unknown>>(PATHS.progression(P1));
    expect(prog1!.gamesPlayed).toBe(6);
    expect(prog1!.gamesWon).toBe(4);

    const prog2 = await readPath<Record<string, unknown>>(PATHS.progression(P2));
    expect(prog2!.gamesPlayed).toBe(6);
    expect(prog2!.gamesWon).toBe(2); // Loser's wins unchanged
  });

  // --- Win streak ---

  it('updates win streak for winner and resets for loser', async () => {
    await seedUser(P1, { coins: 0 });
    await seedUser(P2, { coins: 0 });
    await seedProgression(P1, { xp: 0, level: 1 });
    await seedProgression(P2, { xp: 0, level: 1 });
    await db.ref(PATHS.streaks(P1)).set({ currentWinStreak: 3, bestWinStreak: 5 });
    await db.ref(PATHS.streaks(P2)).set({ currentWinStreak: 2, bestWinStreak: 4 });
    await seedEscrow('esc1', makeLockedEscrow());
    await seedGame('g1', makeFinishedGame(0, 'esc1'));

    await callSettle('g1', P1);

    const s1 = await readPath<Record<string, unknown>>(PATHS.streaks(P1));
    expect(s1!.currentWinStreak).toBe(4);
    expect(s1!.bestWinStreak).toBe(5); // Didn't beat record

    const s2 = await readPath<Record<string, unknown>>(PATHS.streaks(P2));
    expect(s2!.currentWinStreak).toBe(0); // Reset on loss
  });
});
