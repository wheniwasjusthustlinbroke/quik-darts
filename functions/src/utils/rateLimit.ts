/**
 * Rate Limiting Utility
 *
 * Shared windowed rate limiter for Cloud Functions.
 * Uses RTDB transaction-based counter pattern.
 *
 * Usage:
 *   await checkRateLimit(userId, 'createGame', 30, 60000); // 30 calls per minute
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.database();

/**
 * Check rate limit for a user and function.
 * Throws HttpsError('resource-exhausted') if limit exceeded.
 *
 * @param userId - The authenticated user's UID
 * @param functionName - Name of the function (used as key)
 * @param limit - Max calls allowed in window
 * @param windowMs - Window duration in milliseconds
 */
export async function checkRateLimit(
  userId: string,
  functionName: string,
  limit: number,
  windowMs: number
): Promise<void> {
  const now = Date.now();
  const rateLimitRef = db.ref(`rateLimits/${userId}/${functionName}`);

  const result = await rateLimitRef.transaction((current) => {
    // Defensive: reset if data is malformed or missing
    if (!current ||
        typeof current.count !== 'number' || !Number.isFinite(current.count) ||
        typeof current.windowStart !== 'number' || !Number.isFinite(current.windowStart)) {
      return {
        count: 1,
        windowStart: now,
      };
    }

    // Check if we're in a new window
    if (now - current.windowStart > windowMs) {
      // New window - reset count
      return {
        count: 1,
        windowStart: now,
      };
    }

    // Check limit
    if (current.count >= limit) {
      return; // Abort - rate limit exceeded
    }

    // Increment count
    return {
      count: current.count + 1,
      windowStart: current.windowStart,
    };
  });

  if (!result.committed) {
    // Compute retryAfter from snapshot (not from outer variable)
    const val = result.snapshot.val();
    const windowStart = typeof val?.windowStart === 'number' ? val.windowStart : now;
    const remainingMs = windowMs - (now - windowStart);
    const retryAfterSec = Math.max(1, Math.ceil(remainingMs / 1000));

    console.warn(`[rateLimit] Rate limit exceeded for user ${userId} on ${functionName}`);
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Too many requests. Try again in ${retryAfterSec}s.`
    );
  }
}

// Pre-configured rate limiters for common functions
export const RATE_LIMITS = {
  createGame: { limit: 30, windowMs: 60000 },    // 30/min
  settleGame: { limit: 20, windowMs: 60000 },    // 20/min
  forfeitGame: { limit: 20, windowMs: 60000 },   // 20/min
  refundEscrow: { limit: 10, windowMs: 60000 },  // 10/min
} as const;
