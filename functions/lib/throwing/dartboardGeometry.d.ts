/**
 * Dartboard Geometry (Server)
 *
 * Core dartboard geometry for segment-neighbor miss system.
 * Single source of truth for ring boundaries, segment positions,
 * and neighbor relationships.
 * NOTE: This file must stay in sync with src/throwing/dartboardGeometry.ts
 */
import { CENTER, BOARD_SIZE } from '../utils/scoreCalculator';
export interface Position {
    x: number;
    y: number;
}
export { CENTER, BOARD_SIZE };
/**
 * Ring types on the dartboard (from center outward).
 * MISS is a first-class outcome for throws outside DOUBLE_OUTER.
 */
export type Ring = 'BULL' | 'OUTER_BULL' | 'INNER_SINGLE' | 'TRIPLE' | 'OUTER_SINGLE' | 'DOUBLE' | 'MISS';
/**
 * A segment on the dartboard.
 * - For numbered segments: ring + number (1-20)
 * - For bulls: ring only (BULL or OUTER_BULL)
 * - For miss: ring only (MISS)
 */
export interface Segment {
    ring: Ring;
    number?: number;
}
/**
 * Segment numbers in clockwise order starting from 20 at top (12 o'clock).
 * Each segment spans 18 degrees (360/20).
 */
export declare const NUMBER_ORDER: readonly number[];
/**
 * Ring boundaries (distance from center).
 * Exported for reference, but prefer using the functions below.
 */
export declare const RING_BOUNDARIES: {
    readonly BULL: {
        readonly inner: 0;
        readonly outer: 10;
    };
    readonly OUTER_BULL: {
        readonly inner: 10;
        readonly outer: 20;
    };
    readonly INNER_SINGLE: {
        readonly inner: 20;
        readonly outer: 119;
    };
    readonly TRIPLE: {
        readonly inner: 119;
        readonly outer: 134;
    };
    readonly OUTER_SINGLE: {
        readonly inner: 134;
        readonly outer: 200;
    };
    readonly DOUBLE: {
        readonly inner: 200;
        readonly outer: 215;
    };
    readonly MISS: {
        readonly inner: 215;
        readonly outer: number;
    };
};
/**
 * Get the index of a number in NUMBER_ORDER.
 */
export declare function getNumberIndex(n: number): number;
/**
 * Get angular neighbors (left/right in NUMBER_ORDER).
 *
 * @param n - The segment number (1-20)
 * @param distance - How many positions away (1 = immediate neighbors, 2 = two away)
 * @returns Array of neighbor numbers [left, right]
 */
export declare function getAngularNeighbors(n: number, distance?: 1 | 2 | 3 | 4): number[];
/**
 * Get all angular neighbors up to a certain distance.
 * Returns neighbors sorted by distance (closest first).
 *
 * @param n - The segment number (1-20)
 * @param maxDistance - Maximum distance to include (1-4)
 * @returns Array of { number, distance } sorted by distance
 */
export declare function getAllAngularNeighbors(n: number, maxDistance: 1 | 2 | 3 | 4): Array<{
    number: number;
    distance: number;
}>;
/**
 * Get radial neighbors (same number, adjacent rings).
 *
 * @param segment - The segment to find neighbors for
 * @returns Array of radially adjacent segments
 */
export declare function getRadialNeighbors(segment: Segment): Segment[];
/**
 * Check if two rings are radially adjacent.
 */
export declare function areRingsAdjacent(ring1: Ring, ring2: Ring): boolean;
/**
 * Get the ring at a given distance from center.
 */
export declare function getRingAtDistance(distance: number): Ring;
/**
 * Get the segment number from an angle.
 * Angle is in radians, 0 = right (3 o'clock), increasing counter-clockwise.
 *
 * @param angle - Angle in radians
 * @returns Segment number (1-20)
 */
export declare function getNumberFromAngle(angle: number): number;
/**
 * Determine which segment a position falls into.
 *
 * @param x - X coordinate (0 to BOARD_SIZE)
 * @param y - Y coordinate (0 to BOARD_SIZE)
 * @returns The segment at that position
 */
export declare function segmentFromPosition(x: number, y: number): Segment;
/**
 * Get the center angle for a segment number.
 *
 * @param n - Segment number (1-20)
 * @returns Angle in radians (0 = right/3 o'clock)
 */
export declare function getSegmentCenterAngle(n: number): number;
/**
 * Get the wedge width for segments (18 degrees in radians).
 */
export declare const WEDGE_WIDTH: number;
/**
 * Generate a random point inside a segment using AREA-UNIFORM sampling.
 *
 * CRITICAL: Uses sqrt formula for radius to ensure uniform distribution by area.
 * r = sqrt(rMin² + u * (rMax² - rMin²))
 *
 * @param segment - The segment to place a point in
 * @param rng - Seeded random number generator (0-1)
 * @returns Position inside the segment
 */
export declare function randomPointInSegment(segment: Segment, rng: () => number): Position;
/**
 * Get the center position of a segment (useful for aiming/targeting).
 *
 * @param segment - The segment to get center of
 * @returns Center position of the segment
 */
export declare function getSegmentCenter(segment: Segment): Position;
/**
 * Check if two segments are the same.
 */
export declare function segmentsEqual(a: Segment, b: Segment): boolean;
/**
 * Get a human-readable label for a segment.
 */
export declare function getSegmentLabel(segment: Segment): string;
