"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.XP_REWARDS = exports.MAX_LEVEL = void 0;
exports.getXPForLevel = getXPForLevel;
exports.getLevelFromXP = getLevelFromXP;
exports.getProgressToNextLevel = getProgressToNextLevel;
exports.getLevelUpCoins = getLevelUpCoins;
exports.generateXPTable = generateXPTable;
// Max level in the game
exports.MAX_LEVEL = 100;
// XP required for each level (exponential curve)
// Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 250 XP, etc.
function getXPForLevel(level) {
    if (level <= 1)
        return 0;
    if (level > exports.MAX_LEVEL)
        return getXPForLevel(exports.MAX_LEVEL);
    // Exponential curve: each level requires ~50% more XP than the previous
    // Base: 100 XP for level 2
    // Formula: 100 * (1.5 ^ (level - 2)) * (level - 1)
    // This gives a smooth curve from 100 XP to ~150,000 XP for level 100
    return Math.floor(50 * level * Math.pow(1.08, level - 1));
}
// Calculate level from total XP
function getLevelFromXP(xp) {
    let level = 1;
    while (level < exports.MAX_LEVEL && xp >= getXPForLevel(level + 1)) {
        level++;
    }
    return level;
}
// XP progress towards next level (0-1)
function getProgressToNextLevel(xp) {
    const currentLevel = getLevelFromXP(xp);
    if (currentLevel >= exports.MAX_LEVEL)
        return 1;
    const currentLevelXP = getXPForLevel(currentLevel);
    const nextLevelXP = getXPForLevel(currentLevel + 1);
    const xpIntoLevel = xp - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    return xpIntoLevel / xpNeeded;
}
// XP rewards for various actions
exports.XP_REWARDS = {
    GAME_PLAYED: 10, // Just for playing
    GAME_WON: 25, // Win bonus
    GAME_WON_WAGERED: 50, // Win wagered match (extra)
    HIGH_CHECKOUT: 15, // Checkout > 100
    PERFECT_LEG: 30, // Win leg with 9 darts or fewer
    _180: 20, // Hit a 180
};
// Coin rewards for leveling up
function getLevelUpCoins(newLevel) {
    // Milestone rewards
    if (newLevel === 5)
        return 100;
    if (newLevel === 10)
        return 200;
    if (newLevel === 25)
        return 500;
    if (newLevel === 50)
        return 1000;
    if (newLevel === 75)
        return 2000;
    if (newLevel === 100)
        return 5000;
    // Regular levels: 10 coins per level
    if (newLevel % 5 === 0)
        return 50; // Every 5 levels
    return 10;
}
// Generate XP table for reference
function generateXPTable() {
    const table = [];
    for (let level = 1; level <= exports.MAX_LEVEL; level++) {
        table.push({
            level,
            xpRequired: level > 1 ? getXPForLevel(level) - getXPForLevel(level - 1) : 0,
            totalXP: getXPForLevel(level),
        });
    }
    return table;
}
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
//# sourceMappingURL=levelSystem.js.map