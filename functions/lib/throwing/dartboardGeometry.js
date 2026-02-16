"use strict";
/**
 * Dartboard Geometry (Server)
 *
 * Core dartboard geometry for segment-neighbor miss system.
 * Single source of truth for ring boundaries, segment positions,
 * and neighbor relationships.
 * NOTE: This file must stay in sync with src/throwing/dartboardGeometry.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEDGE_WIDTH = exports.RING_BOUNDARIES = exports.NUMBER_ORDER = exports.BOARD_SIZE = exports.CENTER = void 0;
exports.getNumberIndex = getNumberIndex;
exports.getAngularNeighbors = getAngularNeighbors;
exports.getAllAngularNeighbors = getAllAngularNeighbors;
exports.getRadialNeighbors = getRadialNeighbors;
exports.areRingsAdjacent = areRingsAdjacent;
exports.getRingAtDistance = getRingAtDistance;
exports.getNumberFromAngle = getNumberFromAngle;
exports.segmentFromPosition = segmentFromPosition;
exports.getSegmentCenterAngle = getSegmentCenterAngle;
exports.randomPointInSegment = randomPointInSegment;
exports.getSegmentCenter = getSegmentCenter;
exports.segmentsEqual = segmentsEqual;
exports.getSegmentLabel = getSegmentLabel;
const scoreCalculator_1 = require("../utils/scoreCalculator");
Object.defineProperty(exports, "CENTER", { enumerable: true, get: function () { return scoreCalculator_1.CENTER; } });
Object.defineProperty(exports, "BOARD_SIZE", { enumerable: true, get: function () { return scoreCalculator_1.BOARD_SIZE; } });
// =============================================================================
// Constants
// =============================================================================
/**
 * Segment numbers in clockwise order starting from 20 at top (12 o'clock).
 * Each segment spans 18 degrees (360/20).
 */
exports.NUMBER_ORDER = scoreCalculator_1.SEGMENTS;
/**
 * Ring boundaries (distance from center).
 * Exported for reference, but prefer using the functions below.
 */
exports.RING_BOUNDARIES = {
    BULL: { inner: 0, outer: scoreCalculator_1.INNER_BULL },
    OUTER_BULL: { inner: scoreCalculator_1.INNER_BULL, outer: scoreCalculator_1.OUTER_BULL },
    INNER_SINGLE: { inner: scoreCalculator_1.OUTER_BULL, outer: scoreCalculator_1.TRIPLE_INNER },
    TRIPLE: { inner: scoreCalculator_1.TRIPLE_INNER, outer: scoreCalculator_1.TRIPLE_OUTER },
    OUTER_SINGLE: { inner: scoreCalculator_1.TRIPLE_OUTER, outer: scoreCalculator_1.DOUBLE_INNER },
    DOUBLE: { inner: scoreCalculator_1.DOUBLE_INNER, outer: scoreCalculator_1.DOUBLE_OUTER },
    // MISS is outside DOUBLE_OUTER, up to board edge
    MISS: { inner: scoreCalculator_1.DOUBLE_OUTER, outer: scoreCalculator_1.BOARD_SIZE / 2 },
};
/**
 * Ring adjacency - which rings are radially adjacent to each other.
 * Used for radial neighbor calculation and areRingsAdjacent().
 *
 * Note: OUTER_BULL lists INNER_SINGLE for geometric adjacency checks,
 * but getRadialNeighbors() handles bulls specially since they have no
 * segment number. The segmentMiss module handles bull→inner_single
 * miss transitions explicitly.
 */
const RING_ADJACENCY = {
    BULL: ['OUTER_BULL'],
    OUTER_BULL: ['BULL', 'INNER_SINGLE'],
    INNER_SINGLE: ['OUTER_BULL', 'TRIPLE'],
    TRIPLE: ['INNER_SINGLE', 'OUTER_SINGLE'],
    OUTER_SINGLE: ['TRIPLE', 'DOUBLE'],
    DOUBLE: ['OUTER_SINGLE'],
    MISS: [], // MISS has no valid neighbors (it's outside the board)
};
// =============================================================================
// Angular Neighbor Functions
// =============================================================================
/**
 * Get the index of a number in NUMBER_ORDER.
 */
function getNumberIndex(n) {
    return exports.NUMBER_ORDER.indexOf(n);
}
/**
 * Get angular neighbors (left/right in NUMBER_ORDER).
 *
 * @param n - The segment number (1-20)
 * @param distance - How many positions away (1 = immediate neighbors, 2 = two away)
 * @returns Array of neighbor numbers [left, right]
 */
function getAngularNeighbors(n, distance = 1) {
    const index = getNumberIndex(n);
    if (index === -1)
        return [];
    const left = exports.NUMBER_ORDER[(index - distance + 20) % 20];
    const right = exports.NUMBER_ORDER[(index + distance) % 20];
    return [left, right];
}
/**
 * Get all angular neighbors up to a certain distance.
 * Returns neighbors sorted by distance (closest first).
 *
 * @param n - The segment number (1-20)
 * @param maxDistance - Maximum distance to include (1-4)
 * @returns Array of { number, distance } sorted by distance
 */
function getAllAngularNeighbors(n, maxDistance) {
    const result = [];
    for (let d = 1; d <= maxDistance; d++) {
        const neighbors = getAngularNeighbors(n, d);
        for (const num of neighbors) {
            result.push({ number: num, distance: d });
        }
    }
    return result;
}
// =============================================================================
// Radial Neighbor Functions
// =============================================================================
/**
 * Get radial neighbors (same number, adjacent rings).
 *
 * @param segment - The segment to find neighbors for
 * @returns Array of radially adjacent segments
 */
function getRadialNeighbors(segment) {
    // Bulls have no number, handle specially
    if (segment.ring === 'BULL') {
        return [{ ring: 'OUTER_BULL' }];
    }
    if (segment.ring === 'OUTER_BULL') {
        return [{ ring: 'BULL' }];
    }
    if (segment.ring === 'MISS') {
        return []; // MISS has no valid neighbors
    }
    const adjacentRings = RING_ADJACENCY[segment.ring];
    const neighbors = [];
    for (const ring of adjacentRings) {
        // Bulls don't have numbers
        if (ring === 'BULL' || ring === 'OUTER_BULL') {
            neighbors.push({ ring });
        }
        else {
            neighbors.push({ ring, number: segment.number });
        }
    }
    return neighbors;
}
/**
 * Check if two rings are radially adjacent.
 */
function areRingsAdjacent(ring1, ring2) {
    return RING_ADJACENCY[ring1].includes(ring2);
}
// =============================================================================
// Position ↔ Segment Conversion
// =============================================================================
/**
 * Get the ring at a given distance from center.
 */
function getRingAtDistance(distance) {
    if (distance <= scoreCalculator_1.INNER_BULL)
        return 'BULL';
    if (distance <= scoreCalculator_1.OUTER_BULL)
        return 'OUTER_BULL';
    if (distance <= scoreCalculator_1.TRIPLE_INNER)
        return 'INNER_SINGLE';
    if (distance <= scoreCalculator_1.TRIPLE_OUTER)
        return 'TRIPLE';
    if (distance <= scoreCalculator_1.DOUBLE_INNER)
        return 'OUTER_SINGLE';
    if (distance <= scoreCalculator_1.DOUBLE_OUTER)
        return 'DOUBLE';
    return 'MISS';
}
/**
 * Get the segment number from an angle.
 * Angle is in radians, 0 = right (3 o'clock), increasing counter-clockwise.
 *
 * @param angle - Angle in radians
 * @returns Segment number (1-20)
 */
function getNumberFromAngle(angle) {
    // Convert to degrees and rotate so 0 is at top (12 o'clock)
    let degrees = (angle * 180) / Math.PI + 90;
    if (degrees < 0)
        degrees += 360;
    // Each segment is 18 degrees, offset by 9 degrees (half-segment)
    const segmentIndex = Math.floor((degrees + 9) / 18) % 20;
    return exports.NUMBER_ORDER[segmentIndex];
}
/**
 * Determine which segment a position falls into.
 *
 * @param x - X coordinate (0 to BOARD_SIZE)
 * @param y - Y coordinate (0 to BOARD_SIZE)
 * @returns The segment at that position
 */
function segmentFromPosition(x, y) {
    const dx = x - scoreCalculator_1.CENTER;
    const dy = y - scoreCalculator_1.CENTER;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const ring = getRingAtDistance(distance);
    // Bulls and MISS don't have a number
    if (ring === 'BULL' || ring === 'OUTER_BULL' || ring === 'MISS') {
        return { ring };
    }
    // Calculate angle and get segment number
    const angle = Math.atan2(dy, dx);
    const number = getNumberFromAngle(angle);
    return { ring, number };
}
// =============================================================================
// Segment → Position (Random Point Inside)
// =============================================================================
/**
 * Get the center angle for a segment number.
 *
 * @param n - Segment number (1-20)
 * @returns Angle in radians (0 = right/3 o'clock)
 */
function getSegmentCenterAngle(n) {
    const index = getNumberIndex(n);
    if (index === -1)
        return 0;
    // Each segment is 18 degrees, index 0 (20) is at top (-90 degrees from right)
    return ((index * 18 - 90) * Math.PI) / 180;
}
/**
 * Get the wedge width for segments (18 degrees in radians).
 */
exports.WEDGE_WIDTH = (18 * Math.PI) / 180;
/**
 * Small epsilon to prevent landing exactly on ring boundaries.
 * Ensures radius is strictly inside the ring, not on the edge.
 */
const EPS = 1e-9;
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
function randomPointInSegment(segment, rng) {
    const boundaries = exports.RING_BOUNDARIES[segment.ring];
    // Area-uniform radius sampling (NOT linear interpolation!)
    // Clamp u to [EPS, 1-EPS] to avoid landing exactly on ring boundaries
    const rMinSq = boundaries.inner * boundaries.inner;
    const rMaxSq = boundaries.outer * boundaries.outer;
    const uRaw = rng();
    const u = Math.min(1 - EPS, Math.max(EPS, uRaw));
    const r = Math.sqrt(rMinSq + u * (rMaxSq - rMinSq));
    let theta;
    if (segment.ring === 'BULL' || segment.ring === 'OUTER_BULL') {
        // Bulls are full circles - random angle
        theta = rng() * 2 * Math.PI;
    }
    else if (segment.ring === 'MISS') {
        // MISS is the area outside DOUBLE_OUTER but inside BOARD_SIZE/2
        // Random angle for full circle
        theta = rng() * 2 * Math.PI;
    }
    else {
        // Numbered segments - random angle within wedge
        const centerAngle = getSegmentCenterAngle(segment.number);
        theta = centerAngle + (rng() - 0.5) * exports.WEDGE_WIDTH;
    }
    return {
        x: scoreCalculator_1.CENTER + r * Math.cos(theta),
        y: scoreCalculator_1.CENTER + r * Math.sin(theta),
    };
}
/**
 * Get the center position of a segment (useful for aiming/targeting).
 *
 * @param segment - The segment to get center of
 * @returns Center position of the segment
 */
function getSegmentCenter(segment) {
    const boundaries = exports.RING_BOUNDARIES[segment.ring];
    const r = (boundaries.inner + boundaries.outer) / 2;
    if (segment.ring === 'BULL' || segment.ring === 'OUTER_BULL' || segment.ring === 'MISS') {
        // Center of board for bulls, arbitrary point for MISS
        if (segment.ring === 'MISS') {
            // Return a point in the MISS zone (arbitrary angle)
            return { x: scoreCalculator_1.CENTER + r, y: scoreCalculator_1.CENTER };
        }
        return { x: scoreCalculator_1.CENTER, y: scoreCalculator_1.CENTER };
    }
    const theta = getSegmentCenterAngle(segment.number);
    return {
        x: scoreCalculator_1.CENTER + r * Math.cos(theta),
        y: scoreCalculator_1.CENTER + r * Math.sin(theta),
    };
}
// =============================================================================
// Segment Comparison
// =============================================================================
/**
 * Check if two segments are the same.
 */
function segmentsEqual(a, b) {
    if (a.ring !== b.ring)
        return false;
    if (a.number !== b.number)
        return false;
    return true;
}
/**
 * Get a human-readable label for a segment.
 */
function getSegmentLabel(segment) {
    if (segment.ring === 'BULL')
        return 'BULL';
    if (segment.ring === 'OUTER_BULL')
        return '25';
    if (segment.ring === 'MISS')
        return 'MISS';
    const prefix = {
        TRIPLE: 'T',
        DOUBLE: 'D',
        INNER_SINGLE: 'S',
        OUTER_SINGLE: 'S',
    }[segment.ring];
    return `${prefix}${segment.number}`;
}
//# sourceMappingURL=dartboardGeometry.js.map