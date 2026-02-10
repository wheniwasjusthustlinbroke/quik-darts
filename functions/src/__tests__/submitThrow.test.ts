/**
 * submitThrow — Unit Tests
 *
 * Tests validation, scoring, game-state checks, rate-limiting, rhythm,
 * and wagered-match escrow verification.
 *
 * Mocks: firebase-admin (DB reads), firebase-functions (handler extraction).
 * Real:  scoreCalculator (pure), exported constants from submitThrow.
 */

// ---------------------------------------------------------------------------
// Mock state — variables prefixed with `mock` are accessible in jest.mock factories
// ---------------------------------------------------------------------------

/** Stores mock RTDB data keyed by path. Set in each test, cleared in beforeEach. */
const mockDatabase: Record<string, unknown> = {};

/** Captures all gameRef.update() calls for assertion. */
const mockUpdate = jest.fn().mockResolvedValue(undefined);

// ---------------------------------------------------------------------------
// jest.mock declarations (hoisted above imports by Jest)
// ---------------------------------------------------------------------------

jest.mock('firebase-admin', () => ({
  database: () => ({
    ref: (path?: string) => {
      if (!path) {
        // db.ref().push().key pattern (line 403 of submitThrow.ts)
        return { push: () => ({ key: 'mock_throw_id' }) };
      }
      return {
        once: jest.fn().mockImplementation(() =>
          Promise.resolve({ val: () => mockDatabase[path] ?? null }),
        ),
        update: mockUpdate,
      };
    },
  }),
}));

jest.mock('firebase-functions', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    region: () => ({
      https: {
        // Return the raw handler so the export IS the handler function
        onCall: (fn: Function) => fn,
      },
    }),
    https: { HttpsError },
  };
});

// ---------------------------------------------------------------------------
// Imports — AFTER mocks so firebase-admin/functions resolve to mocks
// ---------------------------------------------------------------------------

import {
  submitThrow,
  MIN_THROW_INTERVAL,
  RHYTHM_CONFIG,
} from '../gameplay/submitThrow';

import {
  calculateScoreFromPosition,
  isBust,
  isCheckout,
  CENTER as BOARD_CENTER,
  DOUBLE_INNER,
} from '../utils/scoreCalculator';

// Cast the export to the raw handler signature (mock makes onCall return fn directly)
const handler = submitThrow as unknown as (
  data: Record<string, unknown>,
  context: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const P1 = 'user_p1';
const P2 = 'user_p2';
// Board center → inner bullseye (score 50, multiplier 1)
const CENTER = { x: BOARD_CENTER, y: BOARD_CENTER };
// Double ring at top of board (multiplier 2) — for checkout tests
const DOUBLE_POS = { x: BOARD_CENTER, y: BOARD_CENTER - DOUBLE_INNER - 5 };

function auth(uid: string) {
  return { auth: { uid, token: { firebase: { sign_in_provider: 'google.com' } } } };
}

function makeGame(overrides: Record<string, unknown> = {}) {
  return {
    status: 'playing',
    player1: { id: P1, score: 501 },
    player2: { id: P2, score: 501 },
    currentPlayer: 0,
    dartsThrown: 0,
    currentTurnScore: 0,
    currentTurnThrows: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('submitThrow', () => {
  beforeEach(() => {
    Object.keys(mockDatabase).forEach((k) => delete mockDatabase[k]);
    mockUpdate.mockClear();
  });

  // --- Auth ---

  it('rejects unauthenticated calls', async () => {
    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, {}))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });

  // --- Input validation ---

  it('rejects missing gameId', async () => {
    await expect(handler({ dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects non-string gameId', async () => {
    await expect(handler({ gameId: 123, dartPosition: CENTER } as any, auth(P1)))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects dart position with negative coordinates', async () => {
    await expect(handler({ gameId: 'g1', dartPosition: { x: -1, y: 250 } }, auth(P1)))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects dart position exceeding board bounds', async () => {
    await expect(handler({ gameId: 'g1', dartPosition: { x: 501, y: 250 } }, auth(P1)))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  // --- Game state ---

  it('rejects when game not found', async () => {
    await expect(handler({ gameId: 'missing', dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects game not in playing state', async () => {
    mockDatabase['games/g1'] = makeGame({ status: 'finished' });
    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects non-participant', async () => {
    mockDatabase['games/g1'] = makeGame();
    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, auth('stranger')))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when not your turn', async () => {
    mockDatabase['games/g1'] = makeGame({ currentPlayer: 1 });
    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({
        code: 'failed-precondition',
        message: expect.stringMatching(/not your turn/i),
      });
  });

  it('rejects when no darts remaining', async () => {
    mockDatabase['games/g1'] = makeGame({ dartsThrown: 3 });
    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({
        code: 'failed-precondition',
        message: expect.stringMatching(/no darts remaining/i),
      });
  });

  // --- Rate limiting ---

  it('rejects throws faster than MIN_THROW_INTERVAL', async () => {
    const now = Date.now();
    mockDatabase['games/g1'] = makeGame({
      dartsThrown: 1,
      currentTurnThrows: [
        { timestamp: now - (MIN_THROW_INTERVAL - 100), position: CENTER },
      ],
    });

    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({
        code: 'failed-precondition',
        message: expect.stringMatching(/too fast/i),
      });
  });

  // --- Server-side scoring ---

  it('returns correct score from calculateScoreFromPosition', async () => {
    mockDatabase['games/g1'] = makeGame();
    const expected = calculateScoreFromPosition(CENTER.x, CENTER.y);

    const result = await handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1));

    expect(result.success).toBe(true);
    expect(result.score).toBe(expected.score);
    expect(result.label).toBe(expected.label);
    expect(result.multiplier).toBe(expected.multiplier);
  });

  it('detects bust when throw exceeds remaining score', async () => {
    // Player1 has 10 left; bullseye scores 50 → bust
    mockDatabase['games/g1'] = makeGame({ player1: { id: P1, score: 10 } });
    const bull = calculateScoreFromPosition(CENTER.x, CENTER.y);

    // Sanity: confirm scoreCalculator agrees this is a bust
    expect(isBust(10, bull.score, bull.multiplier)).toBe(true);

    const result = await handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1));

    expect(result.isBust).toBe(true);
    expect(result.turnEnded).toBe(true);
    // Score resets to start-of-turn value
    expect(result.newScore).toBe(10);
  });

  it('detects checkout with double finish', async () => {
    // Compute a double-ring hit and set player score to match
    const dbl = calculateScoreFromPosition(DOUBLE_POS.x, DOUBLE_POS.y);
    expect(dbl.multiplier).toBe(2); // Sanity: position is in double ring

    mockDatabase['games/g1'] = makeGame({ player1: { id: P1, score: dbl.score } });

    // Sanity: confirm scoreCalculator agrees this is a checkout
    expect(isCheckout(dbl.score, dbl.score, dbl.multiplier)).toBe(true);

    const result = await handler({ gameId: 'g1', dartPosition: DOUBLE_POS }, auth(P1));

    expect(result.isCheckout).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(result.winner).toBe(0);
    expect(result.newScore).toBe(0);
  });

  // --- Wagered match validation ---

  it('rejects wagered match with missing escrow', async () => {
    mockDatabase['games/g1'] = makeGame({
      wagerAmount: 100,
      wager: { escrowId: 'esc1' },
    });
    // No escrow seeded → null

    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({
        code: 'failed-precondition',
        message: expect.stringMatching(/escrow not found/i),
      });
  });

  it('rejects wagered match with unlocked escrow', async () => {
    mockDatabase['games/g1'] = makeGame({
      wagerAmount: 100,
      wager: { escrowId: 'esc1' },
    });
    mockDatabase['escrow/esc1'] = { status: 'pending' };

    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({
        code: 'failed-precondition',
        message: expect.stringMatching(/not locked/i),
      });
  });

  it('rejects wagered match without required aimPoint/powerValue', async () => {
    mockDatabase['games/g1'] = makeGame({
      wagerAmount: 100,
      wager: { escrowId: 'esc1' },
    });
    mockDatabase['escrow/esc1'] = { status: 'locked' };

    // No aimPoint or powerValue → anti-cheat rejects
    await expect(handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1)))
      .rejects.toMatchObject({
        code: 'failed-precondition',
        message: expect.stringMatching(/missing_required_payload/),
      });
  });

  // --- Rhythm ---

  it('returns neutral rhythm for first throw of turn', async () => {
    mockDatabase['games/g1'] = makeGame({ currentTurnThrows: [] });

    const result = await handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1));
    expect(result.rhythm).toBe('neutral');
  });

  it('returns rushing rhythm when interval < rushThreshold', async () => {
    const now = Date.now();
    mockDatabase['games/g1'] = makeGame({
      dartsThrown: 1,
      currentTurnThrows: [
        { timestamp: now - (RHYTHM_CONFIG.rushThreshold - 200), position: CENTER },
      ],
    });

    // Interval ≈ 800ms which is > MIN_THROW_INTERVAL(500) but < rushThreshold(1000)
    const result = await handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1));
    expect(result.rhythm).toBe('rushing');
  });

  it('returns hesitating rhythm when interval > hesitateThreshold', async () => {
    const now = Date.now();
    mockDatabase['games/g1'] = makeGame({
      dartsThrown: 1,
      currentTurnThrows: [
        { timestamp: now - (RHYTHM_CONFIG.hesitateThreshold + 500), position: CENTER },
      ],
    });

    const result = await handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1));
    expect(result.rhythm).toBe('hesitating');
  });

  // --- DB update ---

  it('calls gameRef.update with throw data', async () => {
    mockDatabase['games/g1'] = makeGame();

    await handler({ gameId: 'g1', dartPosition: CENTER }, auth(P1));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updates = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updates).toHaveProperty('dartsThrown');
    expect(updates).toHaveProperty('throwHistory/mock_throw_id');
  });
});
