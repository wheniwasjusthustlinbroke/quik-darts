/**
 * Level System
 *
 * XP-based progression system with 100 levels.
 * XP requirements increase with each level.
 *
 * Level-up rewards:
 * - Coins awarded at certain milestones
 * - Could add cosmetic unlocks in the future
 */
export declare const MAX_LEVEL = 100;
export declare function getXPForLevel(level: number): number;
export declare function getLevelFromXP(xp: number): number;
export declare function getProgressToNextLevel(xp: number): number;
export declare const XP_REWARDS: {
    GAME_PLAYED: number;
    GAME_WON: number;
    GAME_WON_WAGERED: number;
    HIGH_CHECKOUT: number;
    PERFECT_LEG: number;
    _180: number;
};
export declare function getLevelUpCoins(newLevel: number): number;
export declare function generateXPTable(): Array<{
    level: number;
    xpRequired: number;
    totalXP: number;
}>;
/**
 * XP Table Preview (first 20 levels):
 *
 * Level 1:  0 XP total
 * Level 2:  108 XP total
 * Level 3:  233 XP total
 * Level 4:  378 XP total
 * Level 5:  546 XP total
 * Level 10: 1,600 XP total
 * Level 20: 5,900 XP total
 * Level 50: 62,000 XP total
 * Level 100: ~700,000 XP total
 */
