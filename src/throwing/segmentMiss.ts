/**
 * Segment Miss System
 *
 * Determines where a dart lands based on power accuracy.
 * Uses segment-neighbor weighted selection instead of XY scatter.
 *
 * V1 HARD RULE: Non-perfect throws have 0% chance of hitting aimed segment.
 */

import {
  Segment,
  segmentFromPosition,
  randomPointInSegment,
  getAngularNeighbors,
  getAllAngularNeighbors,
  segmentsEqual,
  getSegmentLabel,
  NUMBER_ORDER,
} from './dartboardGeometry';

// =============================================================================
// Types
// =============================================================================

export type MissTier = 'perfect' | 'slight' | 'medium' | 'wide' | 'scatter';
export type DirectionalBias = 'weak' | 'neutral' | 'strong';

export interface WeightedCandidate {
  segment: Segment;
  weight: number;
}

export interface MissResult {
  x: number;
  y: number;
  segment: Segment;
  label: string;
  tier: MissTier;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_REROLLS = 5;

// =============================================================================
// Miss Tier Calculation
// =============================================================================

/**
 * Determine miss tier from power value.
 * Based on distance from perfect zone edges.
 * Uses strict bounds (> / <) to match isInPerfectZone in legacyMeter.
 */
export function getMissTier(
  power: number,
  perfectMin: number,
  perfectMax: number
): MissTier {
  // Inside perfect zone (strict bounds to match isInPerfectZone)
  if (power > perfectMin && power < perfectMax) {
    return 'perfect';
  }

  // Distance from nearest edge of perfect zone
  // Use <= for perfectMin to handle boundary equality correctly
  const distanceFromPerfect =
    power <= perfectMin ? perfectMin - power : power - perfectMax;

  if (distanceFromPerfect <= 6) return 'slight';
  if (distanceFromPerfect <= 12) return 'medium';
  if (distanceFromPerfect <= 22) return 'wide';
  return 'scatter';
}

/**
 * Get directional bias from power.
 * Underpowered = bias toward inner rings.
 * Overpowered = bias toward outer rings.
 * Uses strict bounds (> / <) to match isInPerfectZone in legacyMeter.
 */
export function getDirectionalBias(
  power: number,
  perfectMin: number,
  perfectMax: number
): DirectionalBias {
  if (power > perfectMin && power < perfectMax) return 'neutral';
  if (power <= perfectMin) return 'weak';
  return 'strong';
}

// =============================================================================
// Candidate Generation (by aimed ring type)
// =============================================================================

/**
 * Get candidates for TRIPLE aimed segment.
 * Slight: ~45% radial (inner/outer single), ~27.5% each angular triple
 */
function getTripleCandidates(
  aimed: Segment,
  tier: MissTier,
  bias: DirectionalBias
): WeightedCandidate[] {
  const candidates: WeightedCandidate[] = [];
  const num = aimed.number!;
  const [left1, right1] = getAngularNeighbors(num, 1);
  const [left2, right2] = getAngularNeighbors(num, 2);

  // Directional bias affects radial weight distribution
  // weak (underpowered) → favor INNER_SINGLE
  // strong (overpowered) → favor OUTER_SINGLE
  let innerWeight: number;
  let outerWeight: number;

  if (bias === 'weak') {
    innerWeight = 28; // ~62% of radial goes inner
    outerWeight = 17; // ~38% of radial goes outer
  } else if (bias === 'strong') {
    innerWeight = 17;
    outerWeight = 28;
  } else {
    innerWeight = 22;
    outerWeight = 23;
  }

  if (tier === 'slight') {
    // Plan: ~45% radial (same number, adjacent ring), ~27.5% each angular
    candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: innerWeight });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: outerWeight });
    candidates.push({ segment: { ring: 'TRIPLE', number: left1 }, weight: 28 });
    candidates.push({ segment: { ring: 'TRIPLE', number: right1 }, weight: 27 });
  } else if (tier === 'medium') {
    // Wider spread
    candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: Math.max(0, innerWeight - 7) });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: Math.max(0, outerWeight - 7) });
    candidates.push({ segment: { ring: 'TRIPLE', number: left1 }, weight: 20 });
    candidates.push({ segment: { ring: 'TRIPLE', number: right1 }, weight: 20 });
    candidates.push({ segment: { ring: 'TRIPLE', number: left2 }, weight: 10 });
    candidates.push({ segment: { ring: 'TRIPLE', number: right2 }, weight: 10 });
    candidates.push({ segment: { ring: 'INNER_SINGLE', number: left1 }, weight: 5 });
    candidates.push({ segment: { ring: 'INNER_SINGLE', number: right1 }, weight: 5 });
  } else if (tier === 'wide') {
    // Very wide, 5% MISS
    candidates.push({ segment: { ring: 'MISS' }, weight: 5 });
    candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: Math.max(0, innerWeight - 12) });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: Math.max(0, outerWeight - 12) });
    const angularNeighbors = getAllAngularNeighbors(num, 3);
    for (const { number: n, distance } of angularNeighbors) {
      const w = distance === 1 ? 12 : distance === 2 ? 8 : 5;
      candidates.push({ segment: { ring: 'TRIPLE', number: n }, weight: w });
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: n }, weight: Math.floor(w / 2) });
    }
  } else {
    // scatter: very wide, 18% MISS, ±4 angular
    candidates.push({ segment: { ring: 'MISS' }, weight: 18 });
    candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 5 });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: 5 });
    const angularNeighbors = getAllAngularNeighbors(num, 4);
    for (const { number: n, distance } of angularNeighbors) {
      const w = distance === 1 ? 10 : distance === 2 ? 7 : distance === 3 ? 5 : 3;
      candidates.push({ segment: { ring: 'TRIPLE', number: n }, weight: w });
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: n }, weight: Math.floor(w / 2) });
      candidates.push({ segment: { ring: 'OUTER_SINGLE', number: n }, weight: Math.floor(w / 2) });
    }
  }

  return candidates;
}

/**
 * Get candidates for DOUBLE aimed segment.
 * Doubles are thin - misses go INWARD, bias affects MISS chance.
 */
function getDoubleCandidates(
  aimed: Segment,
  tier: MissTier,
  bias: DirectionalBias
): WeightedCandidate[] {
  const candidates: WeightedCandidate[] = [];
  const num = aimed.number!;
  const [left1, right1] = getAngularNeighbors(num, 1);
  const [left2, right2] = getAngularNeighbors(num, 2);

  // strong (overpowered) → higher MISS chance (overshot the board)
  const missBonus = bias === 'strong' ? 8 : 0;

  if (tier === 'slight') {
    // Mostly inward (outer single same number), some angular doubles
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: 70 });
    candidates.push({ segment: { ring: 'DOUBLE', number: left1 }, weight: 15 });
    candidates.push({ segment: { ring: 'DOUBLE', number: right1 }, weight: 15 });
  } else if (tier === 'medium') {
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: 50 });
    candidates.push({ segment: { ring: 'DOUBLE', number: left1 }, weight: 12 });
    candidates.push({ segment: { ring: 'DOUBLE', number: right1 }, weight: 12 });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: left1 }, weight: 10 });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: right1 }, weight: 10 });
    candidates.push({ segment: { ring: 'MISS' }, weight: 6 + missBonus });
  } else if (tier === 'wide') {
    // 8% base MISS + bias bonus
    candidates.push({ segment: { ring: 'MISS' }, weight: 8 + missBonus });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: 35 });
    candidates.push({ segment: { ring: 'DOUBLE', number: left1 }, weight: 10 });
    candidates.push({ segment: { ring: 'DOUBLE', number: right1 }, weight: 10 });
    candidates.push({ segment: { ring: 'DOUBLE', number: left2 }, weight: 5 });
    candidates.push({ segment: { ring: 'DOUBLE', number: right2 }, weight: 5 });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: left1 }, weight: 10 });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: right1 }, weight: 10 });
    candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: Math.max(0, 7 - (missBonus > 0 ? 4 : 0)) });
  } else {
    // scatter: 18% base MISS + bias bonus, ±4 angular
    candidates.push({ segment: { ring: 'MISS' }, weight: 18 + missBonus });
    candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: 20 });
    const angularNeighbors = getAllAngularNeighbors(num, 4);
    for (const { number: n, distance } of angularNeighbors) {
      const w = distance === 1 ? 8 : distance === 2 ? 5 : distance === 3 ? 3 : 2;
      candidates.push({ segment: { ring: 'DOUBLE', number: n }, weight: w });
      candidates.push({ segment: { ring: 'OUTER_SINGLE', number: n }, weight: w });
    }
  }

  return candidates;
}

/**
 * Get candidates for SINGLE (inner or outer) aimed segment.
 * Bias affects radial direction preference.
 */
function getSingleCandidates(
  aimed: Segment,
  tier: MissTier,
  bias: DirectionalBias
): WeightedCandidate[] {
  const candidates: WeightedCandidate[] = [];
  const num = aimed.number!;
  const isInner = aimed.ring === 'INNER_SINGLE';
  const [left1, right1] = getAngularNeighbors(num, 1);
  const [left2, right2] = getAngularNeighbors(num, 2);

  // Directional bias for radial neighbors
  // weak → favor ring closer to center
  // strong → favor ring further from center
  let inwardWeight: number;
  let outwardWeight: number;

  if (bias === 'weak') {
    inwardWeight = 25;
    outwardWeight = 15;
  } else if (bias === 'strong') {
    inwardWeight = 15;
    outwardWeight = 25;
  } else {
    inwardWeight = 20;
    outwardWeight = 20;
  }

  if (tier === 'slight') {
    if (isInner) {
      // INNER_SINGLE: inward = OUTER_BULL, outward = TRIPLE
      candidates.push({ segment: { ring: 'OUTER_BULL' }, weight: inwardWeight });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: outwardWeight });
    } else {
      // OUTER_SINGLE: inward = TRIPLE, outward = DOUBLE
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: inwardWeight });
      candidates.push({ segment: { ring: 'DOUBLE', number: num }, weight: outwardWeight });
    }
    // Angular neighbors in same ring
    candidates.push({ segment: { ring: aimed.ring, number: left1 }, weight: 20 });
    candidates.push({ segment: { ring: aimed.ring, number: right1 }, weight: 20 });
  } else if (tier === 'medium') {
    if (isInner) {
      candidates.push({ segment: { ring: 'OUTER_BULL' }, weight: Math.max(0, inwardWeight - 5) });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: Math.max(0, outwardWeight - 5) });
    } else {
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: Math.max(0, inwardWeight - 5) });
      candidates.push({ segment: { ring: 'DOUBLE', number: num }, weight: Math.max(0, outwardWeight - 5) });
    }
    candidates.push({ segment: { ring: aimed.ring, number: left1 }, weight: 18 });
    candidates.push({ segment: { ring: aimed.ring, number: right1 }, weight: 18 });
    candidates.push({ segment: { ring: aimed.ring, number: left2 }, weight: 10 });
    candidates.push({ segment: { ring: aimed.ring, number: right2 }, weight: 10 });
    candidates.push({ segment: { ring: 'MISS' }, weight: 4 });
  } else if (tier === 'wide') {
    // 6% MISS
    candidates.push({ segment: { ring: 'MISS' }, weight: 6 });
    if (isInner) {
      candidates.push({ segment: { ring: 'OUTER_BULL' }, weight: Math.max(0, inwardWeight - 8) });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: Math.max(0, outwardWeight - 8) });
    } else {
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: Math.max(0, inwardWeight - 8) });
      candidates.push({ segment: { ring: 'DOUBLE', number: num }, weight: Math.max(0, outwardWeight - 8) });
    }
    const angularNeighbors = getAllAngularNeighbors(num, 3);
    for (const { number: n, distance } of angularNeighbors) {
      const w = distance === 1 ? 12 : distance === 2 ? 8 : 5;
      candidates.push({ segment: { ring: aimed.ring, number: n }, weight: w });
    }
  } else {
    // scatter: 16% MISS, ±4 angular
    candidates.push({ segment: { ring: 'MISS' }, weight: 16 });
    if (isInner) {
      candidates.push({ segment: { ring: 'OUTER_BULL' }, weight: 8 });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: 8 });
    } else {
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: 8 });
      candidates.push({ segment: { ring: 'DOUBLE', number: num }, weight: 8 });
    }
    const angularNeighbors = getAllAngularNeighbors(num, 4);
    for (const { number: n, distance } of angularNeighbors) {
      const w = distance === 1 ? 8 : distance === 2 ? 5 : distance === 3 ? 3 : 2;
      candidates.push({ segment: { ring: aimed.ring, number: n }, weight: w });
      // Also add adjacent rings
      if (isInner) {
        candidates.push({ segment: { ring: 'TRIPLE', number: n }, weight: Math.floor(w / 2) });
      } else {
        candidates.push({ segment: { ring: 'DOUBLE', number: n }, weight: Math.floor(w / 2) });
      }
    }
  }

  return candidates;
}

/**
 * Get candidates for BULL aimed segment.
 * Bulls have no angular neighbors - spread to all inner singles rotationally symmetric.
 */
function getBullCandidates(
  tier: MissTier,
  _bias: DirectionalBias
): WeightedCandidate[] {
  const candidates: WeightedCandidate[] = [];

  if (tier === 'slight') {
    // Mostly OUTER_BULL, some spread to all inner singles equally
    candidates.push({ segment: { ring: 'OUTER_BULL' }, weight: 60 });
    // Spread remaining 40% across all 20 inner singles (2 each)
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 2 });
    }
  } else if (tier === 'medium') {
    candidates.push({ segment: { ring: 'OUTER_BULL' }, weight: 30 });
    // Spread 70% across all inner singles (~3.5 each)
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 3 });
    }
    // Add some triple spread
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: 1 });
    }
  } else if (tier === 'wide') {
    // 8% MISS
    candidates.push({ segment: { ring: 'MISS' }, weight: 8 });
    candidates.push({ segment: { ring: 'OUTER_BULL' }, weight: 15 });
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 2 });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: 1 });
    }
  } else {
    // scatter: 15% MISS
    candidates.push({ segment: { ring: 'MISS' }, weight: 15 });
    candidates.push({ segment: { ring: 'OUTER_BULL' }, weight: 10 });
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 2 });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: 1 });
      candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: 1 });
    }
  }

  return candidates;
}

/**
 * Get candidates for OUTER_BULL (25) aimed segment.
 * Similar to BULL but slight bias outward.
 */
function getOuterBullCandidates(
  tier: MissTier,
  _bias: DirectionalBias
): WeightedCandidate[] {
  const candidates: WeightedCandidate[] = [];

  if (tier === 'slight') {
    // Can go to BULL or spread to inner singles
    candidates.push({ segment: { ring: 'BULL' }, weight: 25 });
    // Spread remaining across all inner singles equally
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 4 });
    }
  } else if (tier === 'medium') {
    candidates.push({ segment: { ring: 'BULL' }, weight: 15 });
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 3 });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: 1 });
    }
  } else if (tier === 'wide') {
    // 6% MISS
    candidates.push({ segment: { ring: 'MISS' }, weight: 6 });
    candidates.push({ segment: { ring: 'BULL' }, weight: 10 });
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 2 });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: 2 });
    }
  } else {
    // scatter: 15% MISS
    candidates.push({ segment: { ring: 'MISS' }, weight: 15 });
    candidates.push({ segment: { ring: 'BULL' }, weight: 5 });
    for (const num of NUMBER_ORDER) {
      candidates.push({ segment: { ring: 'INNER_SINGLE', number: num }, weight: 2 });
      candidates.push({ segment: { ring: 'TRIPLE', number: num }, weight: 1 });
      candidates.push({ segment: { ring: 'OUTER_SINGLE', number: num }, weight: 1 });
    }
  }

  return candidates;
}

// =============================================================================
// Candidate Selection
// =============================================================================

/**
 * Get all candidates for a miss, based on aimed segment and tier.
 * V1 RULE: Aimed segment is EXCLUDED from all non-perfect candidates.
 */
export function getCandidates(
  aimed: Segment,
  tier: MissTier,
  bias: DirectionalBias
): WeightedCandidate[] {
  // Guard: if aimed is MISS, return MISS (can't aim outside board meaningfully)
  if (aimed.ring === 'MISS') {
    return [{ segment: { ring: 'MISS' }, weight: 100 }];
  }

  let candidates: WeightedCandidate[];

  switch (aimed.ring) {
    case 'BULL':
      candidates = getBullCandidates(tier, bias);
      break;
    case 'OUTER_BULL':
      candidates = getOuterBullCandidates(tier, bias);
      break;
    case 'TRIPLE':
      candidates = getTripleCandidates(aimed, tier, bias);
      break;
    case 'DOUBLE':
      candidates = getDoubleCandidates(aimed, tier, bias);
      break;
    case 'INNER_SINGLE':
    case 'OUTER_SINGLE':
      candidates = getSingleCandidates(aimed, tier, bias);
      break;
    default:
      // Fallback - should not happen
      candidates = [{ segment: { ring: 'MISS' }, weight: 100 }];
  }

  // V1 RULE: Filter out aimed segment (0% chance to hit aimed on non-perfect)
  // Also filter out zero/negative weights
  return candidates.filter((c) => !segmentsEqual(c.segment, aimed) && c.weight > 0);
}

/**
 * Select a segment from weighted candidates using RNG.
 * Deterministic given same RNG sequence.
 */
export function selectFromCandidates(
  candidates: WeightedCandidate[],
  rng: () => number
): Segment {
  if (candidates.length === 0) {
    return { ring: 'MISS' };
  }

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) {
    return { ring: 'MISS' };
  }

  const roll = rng() * totalWeight;

  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (roll < cumulative) {
      return candidate.segment;
    }
  }

  // Fallback to last candidate
  return candidates[candidates.length - 1].segment;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Apply segment-based miss logic to a throw.
 *
 * @param aimX - Aimed X position
 * @param aimY - Aimed Y position
 * @param power - Power bar value (0-100)
 * @param perfectMin - Perfect zone minimum
 * @param perfectMax - Perfect zone maximum
 * @param rng - Seeded RNG function
 * @returns MissResult with final position, segment, and tier
 */
export function applySegmentMiss(
  aimX: number,
  aimY: number,
  power: number,
  perfectMin: number,
  perfectMax: number,
  rng: () => number
): MissResult {
  const aimed = segmentFromPosition(aimX, aimY);
  const tier = getMissTier(power, perfectMin, perfectMax);

  // Guard: if somehow aiming outside board, return MISS
  if (aimed.ring === 'MISS') {
    const point = randomPointInSegment(aimed, rng);
    return {
      x: point.x,
      y: point.y,
      segment: aimed,
      label: 'MISS',
      tier,
    };
  }

  // Perfect hit: return aimed segment with area-uniform random point
  if (tier === 'perfect') {
    const point = randomPointInSegment(aimed, rng);
    return {
      x: point.x,
      y: point.y,
      segment: aimed,
      label: getSegmentLabel(aimed),
      tier,
    };
  }

  // Non-perfect: select from candidates (aimed excluded)
  const bias = getDirectionalBias(power, perfectMin, perfectMax);
  const candidates = getCandidates(aimed, tier, bias);

  // Select segment, generate point, verify landed segment
  let selected = selectFromCandidates(candidates, rng);
  let point = randomPointInSegment(selected, rng);
  let landed = segmentFromPosition(point.x, point.y);

  // V1 RULE: Re-roll if landed segment equals aimed (belt-and-suspenders)
  let retries = 0;
  while (segmentsEqual(landed, aimed) && retries < MAX_REROLLS) {
    selected = selectFromCandidates(candidates, rng);
    point = randomPointInSegment(selected, rng);
    landed = segmentFromPosition(point.x, point.y);
    retries++;
  }

  // Final fallback: if still aimed, force MISS
  if (segmentsEqual(landed, aimed)) {
    point = randomPointInSegment({ ring: 'MISS' }, rng);
    landed = { ring: 'MISS' };
  }

  return {
    x: point.x,
    y: point.y,
    segment: landed,
    label: getSegmentLabel(landed),
    tier,
  };
}
