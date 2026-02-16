/**
 * Segment Miss System (Server)
 *
 * Determines where a dart lands based on power accuracy.
 * Uses segment-neighbor weighted selection instead of XY scatter.
 *
 * V1 HARD RULE: Non-perfect throws have 0% chance of hitting aimed segment.
 *
 * NOTE: This file must stay in sync with src/throwing/segmentMiss.ts
 */
import { Segment } from './dartboardGeometry';
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
/**
 * Determine miss tier from power value.
 * Based on distance from perfect zone edges.
 * Uses strict bounds (> / <) to match isInPerfectZone in legacyMeter.
 */
export declare function getMissTier(power: number, perfectMin: number, perfectMax: number): MissTier;
/**
 * Get directional bias from power.
 * Underpowered = bias toward inner rings.
 * Overpowered = bias toward outer rings.
 * Uses strict bounds (> / <) to match isInPerfectZone in legacyMeter.
 */
export declare function getDirectionalBias(power: number, perfectMin: number, perfectMax: number): DirectionalBias;
/**
 * Get all candidates for a miss, based on aimed segment and tier.
 * V1 RULE: Aimed segment is EXCLUDED from all non-perfect candidates.
 */
export declare function getCandidates(aimed: Segment, tier: MissTier, bias: DirectionalBias): WeightedCandidate[];
/**
 * Select a segment from weighted candidates using RNG.
 * Deterministic given same RNG sequence.
 */
export declare function selectFromCandidates(candidates: WeightedCandidate[], rng: () => number): Segment;
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
export declare function applySegmentMiss(aimX: number, aimY: number, power: number, perfectMin: number, perfectMax: number, rng: () => number): MissResult;
