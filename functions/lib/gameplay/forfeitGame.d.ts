/**
 * Forfeit Game
 *
 * Handles game forfeits due to disconnect or manual forfeit.
 * Awards victory to the remaining player.
 *
 * Security:
 * - Only a player in the game can forfeit
 * - Players can only forfeit themselves (not opponent)
 * - Triggers escrow settlement if wagered game
 */
import * as functions from 'firebase-functions';
export declare const forfeitGame: functions.HttpsFunction & functions.Runnable<any>;
