/**
 * Initialize New User
 *
 * Creates a wallet with starting coins for newly signed-in users.
 * Only works for authenticated users with Google/Facebook/Apple sign-in.
 * Anonymous users do NOT get coins (guest/demo mode).
 *
 * Security:
 * - Rejects anonymous auth (prevents account farming)
 * - Uses transaction to prevent double-initialization
 * - Checks if wallet already exists
 */
import * as functions from 'firebase-functions';
export declare const initializeNewUser: functions.HttpsFunction & functions.Runnable<any>;
