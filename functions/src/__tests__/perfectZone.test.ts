/**
 * Unit tests for perfectZone.ts helpers
 *
 * Tests the dynamic perfect zone calculation logic:
 * - normalizeLabel: segment label normalization
 * - getWinningSegment: checkout segment detection
 * - calculatePerfectZoneBounds: zone width calculation
 * - calculateShrinkToAdd: shrink amount per hit type
 */

import {
  normalizeLabel,
  getWinningSegment,
  calculatePerfectZoneBounds,
  calculateShrinkToAdd,
  PERFECT_ZONE_CENTER,
  PERFECT_ZONE_BASE_WIDTH,
  PERFECT_ZONE_MIN_WIDTH,
  PERFECT_ZONE_CHECKOUT,
  SHRINK_TREBLE,
  SHRINK_DOUBLE_SINGLE,
} from '../gameplay/perfectZone';

describe('normalizeLabel', () => {
  it('should uppercase and trim labels', () => {
    expect(normalizeLabel('t20')).toBe('T20');
    expect(normalizeLabel('  d5  ')).toBe('D5');
    expect(normalizeLabel('S19')).toBe('S19');
  });

  it('should normalize bull variants to BULL', () => {
    expect(normalizeLabel('BULL')).toBe('BULL');
    expect(normalizeLabel('bull')).toBe('BULL');
    expect(normalizeLabel('DBULL')).toBe('BULL');
    expect(normalizeLabel('D25')).toBe('BULL');
    expect(normalizeLabel('BULLSEYE')).toBe('BULL');
    expect(normalizeLabel('bullseye')).toBe('BULL');
  });

  it('should not normalize outer bull (25)', () => {
    expect(normalizeLabel('25')).toBe('25');
    expect(normalizeLabel('S25')).toBe('S25');
  });
});

describe('getWinningSegment', () => {
  it('should return BULL for score 50', () => {
    expect(getWinningSegment(50)).toBe('BULL');
  });

  it('should return correct double for even scores 2-40', () => {
    expect(getWinningSegment(2)).toBe('D1');
    expect(getWinningSegment(4)).toBe('D2');
    expect(getWinningSegment(20)).toBe('D10');
    expect(getWinningSegment(40)).toBe('D20');
    expect(getWinningSegment(32)).toBe('D16');
  });

  it('should return null for odd scores', () => {
    expect(getWinningSegment(1)).toBeNull();
    expect(getWinningSegment(3)).toBeNull();
    expect(getWinningSegment(19)).toBeNull();
    expect(getWinningSegment(39)).toBeNull();
  });

  it('should return null for scores outside valid range', () => {
    expect(getWinningSegment(0)).toBeNull();
    expect(getWinningSegment(42)).toBeNull();
    expect(getWinningSegment(100)).toBeNull();
    expect(getWinningSegment(170)).toBeNull();
  });

  it('should return null for negative scores', () => {
    expect(getWinningSegment(-2)).toBeNull();
    expect(getWinningSegment(-50)).toBeNull();
  });
});

describe('calculatePerfectZoneBounds', () => {
  it('should return base width with no shrink', () => {
    const bounds = calculatePerfectZoneBounds(0, false);
    expect(bounds.min).toBe(PERFECT_ZONE_CENTER - PERFECT_ZONE_BASE_WIDTH / 2);
    expect(bounds.max).toBe(PERFECT_ZONE_CENTER + PERFECT_ZONE_BASE_WIDTH / 2);
    expect(bounds.min).toBe(45);
    expect(bounds.max).toBe(55);
  });

  it('should shrink zone with accumulated shrink', () => {
    // Shrink by 3 (one treble hit)
    const bounds1 = calculatePerfectZoneBounds(3, false);
    expect(bounds1.max - bounds1.min).toBe(PERFECT_ZONE_BASE_WIDTH - 3); // 7
    expect(bounds1.min).toBe(46.5);
    expect(bounds1.max).toBe(53.5);

    // Shrink by 4.5 (treble + single)
    const bounds2 = calculatePerfectZoneBounds(4.5, false);
    expect(bounds2.max - bounds2.min).toBe(PERFECT_ZONE_BASE_WIDTH - 4.5); // 5.5
    expect(bounds2.min).toBe(47.25);
    expect(bounds2.max).toBe(52.75);
  });

  it('should not shrink below minimum width', () => {
    // Shrink by 10 (more than base width)
    const bounds = calculatePerfectZoneBounds(10, false);
    expect(bounds.max - bounds.min).toBe(PERFECT_ZONE_MIN_WIDTH); // 4
    expect(bounds.min).toBe(48);
    expect(bounds.max).toBe(52);

    // Shrink by 20 (way more than base width)
    const bounds2 = calculatePerfectZoneBounds(20, false);
    expect(bounds2.max - bounds2.min).toBe(PERFECT_ZONE_MIN_WIDTH); // 4
  });

  it('should use ultra-narrow checkout width', () => {
    const bounds = calculatePerfectZoneBounds(0, true);
    expect(bounds.max - bounds.min).toBe(PERFECT_ZONE_CHECKOUT); // 2
    expect(bounds.min).toBe(49);
    expect(bounds.max).toBe(51);
  });

  it('should ignore shrink amount when checkout is true', () => {
    // Even with shrink, checkout is always ultra-narrow
    const bounds = calculatePerfectZoneBounds(3, true);
    expect(bounds.max - bounds.min).toBe(PERFECT_ZONE_CHECKOUT); // 2
    expect(bounds.min).toBe(49);
    expect(bounds.max).toBe(51);
  });
});

describe('calculateShrinkToAdd', () => {
  describe('miss (score 0)', () => {
    it('should return 0 for any miss', () => {
      expect(calculateShrinkToAdd(1, 0, 'MISS', null)).toBe(0);
      expect(calculateShrinkToAdd(2, 0, 'MISS', 'D20')).toBe(0);
      expect(calculateShrinkToAdd(3, 0, 'MISS', null)).toBe(0);
    });
  });

  describe('treble hits', () => {
    it('should return SHRINK_TREBLE (3) for treble hits', () => {
      expect(calculateShrinkToAdd(3, 60, 'T20', null)).toBe(SHRINK_TREBLE);
      expect(calculateShrinkToAdd(3, 57, 'T19', null)).toBe(SHRINK_TREBLE);
      expect(calculateShrinkToAdd(3, 3, 'T1', null)).toBe(SHRINK_TREBLE);
    });

    it('should return SHRINK_TREBLE even with winning segment set', () => {
      // Trebles can't be winning segments, but test the logic
      expect(calculateShrinkToAdd(3, 60, 'T20', 'D20')).toBe(SHRINK_TREBLE);
    });
  });

  describe('double hits', () => {
    it('should return SHRINK_DOUBLE_SINGLE (1.5) for non-winning doubles', () => {
      expect(calculateShrinkToAdd(2, 40, 'D20', null)).toBe(SHRINK_DOUBLE_SINGLE);
      expect(calculateShrinkToAdd(2, 40, 'D20', 'D10')).toBe(SHRINK_DOUBLE_SINGLE);
      expect(calculateShrinkToAdd(2, 2, 'D1', 'D20')).toBe(SHRINK_DOUBLE_SINGLE);
    });

    it('should return 0 for winning double (checkout)', () => {
      expect(calculateShrinkToAdd(2, 40, 'D20', 'D20')).toBe(0);
      expect(calculateShrinkToAdd(2, 2, 'D1', 'D1')).toBe(0);
      expect(calculateShrinkToAdd(2, 32, 'D16', 'D16')).toBe(0);
    });
  });

  describe('bull hits', () => {
    it('should return SHRINK_DOUBLE_SINGLE (1.5) for non-winning bull', () => {
      expect(calculateShrinkToAdd(2, 50, 'BULL', null)).toBe(SHRINK_DOUBLE_SINGLE);
      expect(calculateShrinkToAdd(2, 50, 'BULL', 'D20')).toBe(SHRINK_DOUBLE_SINGLE);
    });

    it('should return 0 for winning bull (checkout from 50)', () => {
      expect(calculateShrinkToAdd(2, 50, 'BULL', 'BULL')).toBe(0);
    });

    it('should normalize bull variants correctly', () => {
      expect(calculateShrinkToAdd(2, 50, 'DBULL', 'BULL')).toBe(0);
      expect(calculateShrinkToAdd(2, 50, 'D25', 'BULL')).toBe(0);
      expect(calculateShrinkToAdd(2, 50, 'bullseye', 'BULL')).toBe(0);
    });
  });

  describe('single hits', () => {
    it('should return SHRINK_DOUBLE_SINGLE (1.5) for singles', () => {
      expect(calculateShrinkToAdd(1, 20, 'S20', null)).toBe(SHRINK_DOUBLE_SINGLE);
      expect(calculateShrinkToAdd(1, 1, 'S1', null)).toBe(SHRINK_DOUBLE_SINGLE);
      expect(calculateShrinkToAdd(1, 19, '19', null)).toBe(SHRINK_DOUBLE_SINGLE);
    });

    it('should return SHRINK_DOUBLE_SINGLE even with winning segment set', () => {
      // Singles can't be winning segments
      expect(calculateShrinkToAdd(1, 20, 'S20', 'D10')).toBe(SHRINK_DOUBLE_SINGLE);
    });
  });

  describe('outer bull (25)', () => {
    it('should return SHRINK_DOUBLE_SINGLE for outer bull', () => {
      // Outer bull is multiplier 1, score 25
      expect(calculateShrinkToAdd(1, 25, '25', null)).toBe(SHRINK_DOUBLE_SINGLE);
      expect(calculateShrinkToAdd(1, 25, 'S25', null)).toBe(SHRINK_DOUBLE_SINGLE);
    });
  });
});

describe('constants', () => {
  it('should have expected values', () => {
    expect(PERFECT_ZONE_CENTER).toBe(50);
    expect(PERFECT_ZONE_BASE_WIDTH).toBe(10);
    expect(PERFECT_ZONE_MIN_WIDTH).toBe(4);
    expect(PERFECT_ZONE_CHECKOUT).toBe(2);
    expect(SHRINK_TREBLE).toBe(3);
    expect(SHRINK_DOUBLE_SINGLE).toBe(1.5);
  });
});
