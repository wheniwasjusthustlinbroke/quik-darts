/**
 * Create Game
 *
 * Creates a new game room for online multiplayer.
 * For wagered games, escrow must be created first.
 *
 * Security:
 * - Validates both players exist
 * - For wagered games: verifies escrow is locked
 * - Only server can create game rooms
 */
import * as functions from 'firebase-functions';
export declare const createGame: functions.HttpsFunction & functions.Runnable<any>;
