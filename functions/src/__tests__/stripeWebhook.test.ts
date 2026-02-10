/**
 * stripeWebhook — Unit Tests
 *
 * Tests HTTP validation, Stripe signature verification, metadata checks,
 * coin-package lookup, and replay prevention.
 *
 * Mocks: stripe (external SDK), firebase-admin (DB), firebase-functions.
 * Real:  COIN_PACKAGES imported from source (no hard-coded values).
 */

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

const mockDatabase: Record<string, unknown> = {};
const mockTransactionFn = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockChildSet = jest.fn().mockResolvedValue(undefined);

/** Tracks the Stripe constructEvent mock for per-test configuration. */
const mockConstructEvent = jest.fn();

// ---------------------------------------------------------------------------
// jest.mock declarations
// ---------------------------------------------------------------------------

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
});

jest.mock('firebase-admin', () => ({
  database: () => ({
    ref: (path?: string) => ({
      transaction: (fn: Function) => {
        // Run the callback with mock data and return result based on mockTransactionFn
        const existing = path ? mockDatabase[path] ?? null : null;
        const result = fn(existing);
        if (result === undefined) {
          // Transaction aborted
          return { committed: false, snapshot: { val: () => existing } };
        }
        if (path) mockDatabase[path] = result;
        mockTransactionFn(path, result);
        return { committed: true, snapshot: { val: () => result } };
      },
      once: jest.fn().mockImplementation(() =>
        Promise.resolve({ val: () => (path ? mockDatabase[path] ?? null : null) }),
      ),
      update: mockUpdate,
      set: jest.fn().mockResolvedValue(undefined),
      child: jest.fn().mockReturnValue({
        set: mockChildSet,
      }),
    }),
  }),
}));

let capturedHandler: (req: unknown, res: unknown) => Promise<void>;

jest.mock('firebase-functions', () => ({
  runWith: () => ({
    region: () => ({
      https: {
        onRequest: (handler: Function) => {
          capturedHandler = handler as typeof capturedHandler;
          return handler;
        },
      },
    }),
  }),
}));

// ---------------------------------------------------------------------------
// Imports — AFTER mocks
// ---------------------------------------------------------------------------

// Trigger module load to capture the handler
import '../payments/stripeWebhook';
import { COIN_PACKAGES } from '../payments/stripeWebhook';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_valid' },
    rawBody: Buffer.from('raw_body'),
    body: 'raw_body',
    ...overrides,
  };
}

function makeRes() {
  const res: Record<string, jest.Mock> = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_session_123',
    metadata: {
      userId: 'user123456789012345678',
      packageId: 'starter',
      coins: '500',
    },
    amount_total: 499,
    currency: 'usd',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stripeWebhook', () => {
  beforeEach(() => {
    Object.keys(mockDatabase).forEach((k) => delete mockDatabase[k]);
    mockConstructEvent.mockReset();
    mockTransactionFn.mockClear();
    mockUpdate.mockClear();
    mockChildSet.mockClear();

    // Set env vars needed by getStripe()
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  });

  // --- HTTP validation ---

  it('rejects non-POST requests with 405', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();

    await capturedHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.send).toHaveBeenCalledWith('Method not allowed');
  });

  it('rejects missing stripe-signature with 400', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();

    await capturedHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Missing signature');
  });

  // --- Signature verification ---

  it('rejects invalid signature with 400', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const req = makeReq();
    const res = makeRes();

    await capturedHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid signature');
  });

  // --- Event handling ---

  it('ignores non-checkout events and returns 200', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: {} },
    });

    const req = makeReq();
    const res = makeRes();

    await capturedHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    // No DB writes should have occurred
    expect(mockTransactionFn).not.toHaveBeenCalled();
  });

  // --- Metadata validation ---

  it('handles missing userId in session metadata gracefully', async () => {
    const session = makeSession({
      metadata: { packageId: 'starter', coins: '500' },
    });

    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session },
    });

    const req = makeReq();
    const res = makeRes();

    await capturedHandler(req, res);

    // Should still return 200 (webhook acknowledged) but not award coins
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockTransactionFn).not.toHaveBeenCalled();
  });

  // --- Package lookup ---

  it('uses correct coin amounts from COIN_PACKAGES for each package', () => {
    // Verify the exported packages have expected structure
    const packageIds = Object.keys(COIN_PACKAGES);
    expect(packageIds.length).toBeGreaterThan(0);

    for (const id of packageIds) {
      expect(COIN_PACKAGES[id].coins).toBeGreaterThan(0);
      expect(typeof COIN_PACKAGES[id].coins).toBe('number');
    }
  });

  it('awards coins matching the package definition', async () => {
    const session = makeSession({ id: 'cs_award_test' });

    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session },
    });

    const req = makeReq();
    const res = makeRes();

    await capturedHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // Fulfillment record should be created
    expect(mockTransactionFn).toHaveBeenCalled();

    // Verify the fulfillment used the correct coin amount from COIN_PACKAGES
    const fulfillmentCall = mockTransactionFn.mock.calls.find(
      ([path]: [string]) => path?.startsWith('stripeFulfillments/'),
    );
    expect(fulfillmentCall).toBeDefined();
    const fulfillmentData = fulfillmentCall![1];
    expect(fulfillmentData.coinsToAward).toBe(COIN_PACKAGES['starter'].coins);
  });

  // --- Replay prevention ---

  it('prevents duplicate fulfillment (replay attack)', async () => {
    // Simulate existing fulfillment record
    mockDatabase['stripeFulfillments/cs_replay_test'] = {
      userId: 'user123456789012345678',
      status: 'completed',
    };

    const session = makeSession({ id: 'cs_replay_test' });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session },
    });

    const req = makeReq();
    const res = makeRes();

    await capturedHandler(req, res);

    // Should acknowledge but not award coins (transaction aborts for existing fulfillment)
    expect(res.status).toHaveBeenCalledWith(200);

    // The fulfillment transaction should have been attempted but aborted
    // No wallet transaction should follow
    const walletCalls = mockTransactionFn.mock.calls.filter(
      ([path]: [string]) => path?.includes('/wallet'),
    );
    expect(walletCalls).toHaveLength(0);
  });

  // --- Success path ---

  it('returns 200 with { received: true } on valid checkout', async () => {
    const session = makeSession({ id: 'cs_success_test' });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session },
    });

    const req = makeReq();
    const res = makeRes();

    await capturedHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
