/**
 * Level System Tests
 */

import {
  MAX_LEVEL,
  getXPForLevel,
  getLevelFromXP,
  getProgressToNextLevel,
  getLevelUpCoins,
  XP_REWARDS,
} from '../utils/levelSystem';

describe('getXPForLevel', () => {
  it('should return 0 XP for level 1', () => {
    expect(getXPForLevel(1)).toBe(0);
  });

  it('should return 0 XP for level 0 or negative', () => {
    expect(getXPForLevel(0)).toBe(0);
    expect(getXPForLevel(-1)).toBe(0);
  });

  it('should return positive XP for level 2+', () => {
    expect(getXPForLevel(2)).toBeGreaterThan(0);
    expect(getXPForLevel(10)).toBeGreaterThan(getXPForLevel(2));
    expect(getXPForLevel(50)).toBeGreaterThan(getXPForLevel(10));
  });

  it('should increase XP requirements with level', () => {
    for (let level = 2; level < 100; level++) {
      expect(getXPForLevel(level + 1)).toBeGreaterThan(getXPForLevel(level));
    }
  });

  it('should cap at MAX_LEVEL', () => {
    expect(getXPForLevel(MAX_LEVEL + 1)).toBe(getXPForLevel(MAX_LEVEL));
    expect(getXPForLevel(200)).toBe(getXPForLevel(MAX_LEVEL));
  });

  it('should return reasonable values for milestone levels', () => {
    // Level 10 should be in low thousands
    expect(getXPForLevel(10)).toBeGreaterThan(500);
    expect(getXPForLevel(10)).toBeLessThan(5000);

    // Level 50 should be in tens of thousands
    expect(getXPForLevel(50)).toBeGreaterThan(10000);
    expect(getXPForLevel(50)).toBeLessThan(200000);

    // Level 100 should be substantial
    expect(getXPForLevel(100)).toBeGreaterThan(100000);
  });
});

describe('getLevelFromXP', () => {
  it('should return level 1 for 0 XP', () => {
    expect(getLevelFromXP(0)).toBe(1);
  });

  it('should return level 1 for negative XP', () => {
    expect(getLevelFromXP(-100)).toBe(1);
  });

  it('should return correct level for exact XP threshold', () => {
    const level5XP = getXPForLevel(5);
    expect(getLevelFromXP(level5XP)).toBe(5);
  });

  it('should return previous level for XP just below threshold', () => {
    const level5XP = getXPForLevel(5);
    expect(getLevelFromXP(level5XP - 1)).toBe(4);
  });

  it('should return current level for XP above threshold', () => {
    const level5XP = getXPForLevel(5);
    expect(getLevelFromXP(level5XP + 1)).toBe(5);
  });

  it('should cap at MAX_LEVEL', () => {
    expect(getLevelFromXP(getXPForLevel(MAX_LEVEL))).toBe(MAX_LEVEL);
    expect(getLevelFromXP(999999999)).toBe(MAX_LEVEL);
  });

  it('should be inverse of getXPForLevel', () => {
    for (let level = 1; level <= 20; level++) {
      const xp = getXPForLevel(level);
      expect(getLevelFromXP(xp)).toBe(level);
    }
  });
});

describe('getProgressToNextLevel', () => {
  it('should return 0 for XP at level start', () => {
    const level5XP = getXPForLevel(5);
    expect(getProgressToNextLevel(level5XP)).toBeCloseTo(0, 1);
  });

  it('should return ~0.5 for XP at midpoint', () => {
    const level5XP = getXPForLevel(5);
    const level6XP = getXPForLevel(6);
    const midpoint = (level5XP + level6XP) / 2;
    expect(getProgressToNextLevel(midpoint)).toBeCloseTo(0.5, 1);
  });

  it('should return close to 1 for XP just below next level', () => {
    const level6XP = getXPForLevel(6);
    expect(getProgressToNextLevel(level6XP - 1)).toBeGreaterThan(0.9);
  });

  it('should return 1 for MAX_LEVEL', () => {
    expect(getProgressToNextLevel(getXPForLevel(MAX_LEVEL))).toBe(1);
    expect(getProgressToNextLevel(999999999)).toBe(1);
  });

  it('should return value between 0 and 1', () => {
    for (let xp = 0; xp <= 10000; xp += 500) {
      const progress = getProgressToNextLevel(xp);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });
});

describe('getLevelUpCoins', () => {
  it('should return 10 for regular levels', () => {
    expect(getLevelUpCoins(2)).toBe(10);
    expect(getLevelUpCoins(3)).toBe(10);
    expect(getLevelUpCoins(7)).toBe(10);
  });

  it('should return 50 for levels divisible by 5 (non-milestone)', () => {
    expect(getLevelUpCoins(15)).toBe(50);
    expect(getLevelUpCoins(20)).toBe(50);
    expect(getLevelUpCoins(30)).toBe(50);
  });

  it('should return milestone rewards', () => {
    expect(getLevelUpCoins(5)).toBe(100);
    expect(getLevelUpCoins(10)).toBe(200);
    expect(getLevelUpCoins(25)).toBe(500);
    expect(getLevelUpCoins(50)).toBe(1000);
    expect(getLevelUpCoins(75)).toBe(2000);
    expect(getLevelUpCoins(100)).toBe(5000);
  });

  it('should always return positive coins', () => {
    for (let level = 1; level <= 100; level++) {
      expect(getLevelUpCoins(level)).toBeGreaterThan(0);
    }
  });
});

describe('XP_REWARDS constants', () => {
  it('should have positive values for all rewards', () => {
    expect(XP_REWARDS.GAME_PLAYED).toBeGreaterThan(0);
    expect(XP_REWARDS.GAME_WON).toBeGreaterThan(0);
    expect(XP_REWARDS.GAME_WON_WAGERED).toBeGreaterThan(0);
    expect(XP_REWARDS.HIGH_CHECKOUT).toBeGreaterThan(0);
    expect(XP_REWARDS.PERFECT_LEG).toBeGreaterThan(0);
    expect(XP_REWARDS._180).toBeGreaterThan(0);
  });

  it('should have GAME_WON greater than GAME_PLAYED', () => {
    expect(XP_REWARDS.GAME_WON).toBeGreaterThan(XP_REWARDS.GAME_PLAYED);
  });

  it('should have GAME_WON_WAGERED greater than GAME_WON', () => {
    expect(XP_REWARDS.GAME_WON_WAGERED).toBeGreaterThan(XP_REWARDS.GAME_WON);
  });
});
