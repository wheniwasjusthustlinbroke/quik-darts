"use strict";
/**
 * Rate Limiting Utility
 *
 * Shared windowed rate limiter for Cloud Functions.
 * Uses RTDB transaction-based counter pattern.
 *
 * Usage:
 *   await checkRateLimit(userId, 'createGame', 30, 60000); // 30 calls per minute
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
exports.RATE_LIMITS = void 0;
exports.checkRateLimit = checkRateLimit;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
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
async function checkRateLimit(userId, functionName, limit, windowMs) {
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
        throw new functions.https.HttpsError('resource-exhausted', `Too many requests. Try again in ${retryAfterSec}s.`);
    }
}
// Pre-configured rate limiters for common functions
exports.RATE_LIMITS = {
    createGame: { limit: 30, windowMs: 60000 }, // 30/min
    settleGame: { limit: 20, windowMs: 60000 }, // 20/min
    forfeitGame: { limit: 20, windowMs: 60000 }, // 20/min
    refundEscrow: { limit: 10, windowMs: 60000 }, // 10/min
};
//# sourceMappingURL=rateLimit.js.map