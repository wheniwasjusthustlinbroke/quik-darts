/**
 * Rate Limiting Utility
 *
 * Shared windowed rate limiter for Cloud Functions.
 * Uses RTDB transaction-based counter pattern.
 *
 * Usage:
 *   await checkRateLimit(userId, 'createGame', 30, 60000); // 30 calls per minute
 */
/**
 * Check rate limit for a user and function.
 * Throws HttpsError('resource-exhausted') if limit exceeded.
 *
 * @param userId - The authenticated user's UID
 * @param functionName - Name of the function (used as key)
 * @param limit - Max calls allowed in window
 * @param windowMs - Window duration in milliseconds
 */
export declare function checkRateLimit(userId: string, functionName: string, limit: number, windowMs: number): Promise<void>;
export declare const RATE_LIMITS: {
    readonly createGame: {
        readonly limit: 30;
        readonly windowMs: 60000;
    };
    readonly settleGame: {
        readonly limit: 20;
        readonly windowMs: 60000;
    };
    readonly forfeitGame: {
        readonly limit: 20;
        readonly windowMs: 60000;
    };
    readonly refundEscrow: {
        readonly limit: 10;
        readonly windowMs: 60000;
    };
};
