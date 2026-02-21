/**
 * Update Profile
 *
 * Server-side profile update with sanitization.
 * Replaces direct RTDB writes for security.
 *
 * Security:
 * - Requires authentication (non-anonymous)
 * - Rate limited
 * - Display name sanitized (Unicode-safe allowlist)
 * - Flag validated (length only - emoji flags are valid)
 * - Allowlist of updatable fields (prevents injection of admin/verified/etc)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sanitizeDisplayName } from '../utils/sanitizeName';
import { checkRateLimit, RATE_LIMITS } from '../utils/rateLimit';

const db = admin.database();

interface UpdateProfileRequest {
  displayName?: string;
  flag?: string;
}

interface UpdateProfileResult {
  success: boolean;
  updates?: Record<string, unknown>;
  error?: string;
}

export const updateProfile = functions
  .region('europe-west1')
  .https.onCall(async (data: UpdateProfileRequest, context): Promise<UpdateProfileResult> => {
    // 1. Must be authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be logged in'
      );
    }

    const userId = context.auth.uid;
    const token = context.auth.token;

    // 2. Must NOT be anonymous
    if (token.firebase?.sign_in_provider === 'anonymous') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Sign in to update profile'
      );
    }

    // 3. Rate limiting
    await checkRateLimit(userId, 'updateProfile', RATE_LIMITS.updateProfile.limit, RATE_LIMITS.updateProfile.windowMs);

    // 4. Validate payload is an object (fail fast on malformed input)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid payload');
    }
    const payload = data as UpdateProfileRequest;

    // 5. Build updates from allowlisted fields only
    const updates: Record<string, unknown> = {};

    if (payload.displayName !== undefined) {
      updates.displayName = sanitizeDisplayName(payload.displayName);
    }

    if (payload.flag !== undefined) {
      // Validate flag (string, max 50 chars - allows emoji flags)
      if (typeof payload.flag !== 'string' || payload.flag.length > 50) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid flag'
        );
      }
      updates.flag = payload.flag;
    }

    // 6. Must have at least one valid field
    if (Object.keys(updates).length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'No valid fields to update'
      );
    }

    // 7. Add updatedAt timestamp for audit trail
    updates.updatedAt = admin.database.ServerValue.TIMESTAMP;

    // 8. Apply updates atomically
    await db.ref(`users/${userId}/profile`).update(updates);

    console.log(`[updateProfile] Profile updated for user ${userId}`);

    return {
      success: true,
      updates,
    };
  });
