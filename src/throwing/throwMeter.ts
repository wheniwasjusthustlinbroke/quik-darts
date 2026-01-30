/**
 * Throw Meter - Pure Functions
 *
 * Monotonic hold-to-charge power meter with rhythm variance and smooth scatter curve.
 * All functions are pure and testable. Injectable RNG for determinism.
 */

// === TUNABLE CONSTANTS (single source of truth) ===
export const FILL_DURATION_BASE_MS = 1200;
export const FILL_VARIANCE = 0.08; // +/-8% variance per throw
export const PERFECT_ZONE_MIN = 47;
export const PERFECT_ZONE_MAX = 63;
export const PERFECT_ZONE_CENTER = 55;
export const OVERCHARGE_START = 100;
export const OVERCHARGE_MAX = 150;
export const OVERCHARGE_DURATION_MS = 600;

// Scatter bounds (pixels)
const SCATTER_MIN = 3;
const SCATTER_MAX = 65;
const SCATTER_OVERCHARGE_MAX = 85;

// Speed ratio thresholds for UI labels
export const SPEED_SLOW_THRESHOLD = 0.96;
export const SPEED_FAST_THRESHOLD = 1.04;

// === TYPES ===
export type ZoneLabel = 'WEAK' | 'PERFECT' | 'STRONG' | 'OVERCHARGE';
export type SpeedLabel = 'SLOW' | 'NORMAL' | 'FAST';
export type RngFunction = () => number;

export interface ScatteredPosition {
  x: number;
  y: number;
}

// === SEEDED RNG UTILITIES ===

/**
 * Create a seeded pseudo-random number generator.
 * Uses mulberry32 algorithm for deterministic results.
 */
export function createSeededRng(seed: number): RngFunction {
  let state = seed;
  return function (): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a per-throw seed from game context.
 * Combines gameId hash with throw index for unique, reproducible seeds.
 */
export function generateThrowSeed(
  gameId: string,
  visitsPlayed: number,
  dartsThrown: number
): number {
  // Simple string hash
  let hash = 0;
  for (let i = 0; i < gameId.length; i++) {
    const char = gameId.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Combine with throw index
  return (hash ^ (visitsPlayed * 1000 + dartsThrown)) | 0;
}

// === CORE METER FUNCTIONS ===

/**
 * Generate fill duration for this throw with rhythm variance.
 * Uses provided RNG for determinism.
 */
export function generateFillDuration(rng: RngFunction = Math.random): number {
  const variance = 1 + (rng() * 2 - 1) * FILL_VARIANCE; // 0.92 - 1.08
  return Math.round(FILL_DURATION_BASE_MS * variance);
}

/**
 * Calculate meter value based on elapsed time and fill duration.
 * Returns value 0-150 (100+ is overcharge zone).
 */
export function calculateMeterValue(
  elapsedMs: number,
  fillDuration: number
): number {
  if (elapsedMs <= 0) return 0;

  if (elapsedMs <= fillDuration) {
    // Normal fill: 0 -> 100
    return (elapsedMs / fillDuration) * 100;
  }

  // Overcharge: 100 -> 150
  const overchargeElapsed = elapsedMs - fillDuration;
  const overchargeProgress = Math.min(
    overchargeElapsed / OVERCHARGE_DURATION_MS,
    1
  );
  return OVERCHARGE_START + overchargeProgress * (OVERCHARGE_MAX - OVERCHARGE_START);
}

/**
 * Check if power is in the perfect zone.
 */
export function isInPerfectZone(power: number): boolean {
  return power >= PERFECT_ZONE_MIN && power <= PERFECT_ZONE_MAX;
}

/**
 * Check if in overcharge zone.
 */
export function isOvercharging(power: number): boolean {
  return power > OVERCHARGE_START;
}

/**
 * Get overcharge percentage (0-100 representing 100->150 range).
 * Returns 0 if not overcharging.
 */
export function getOverchargePercent(power: number): number {
  if (power <= OVERCHARGE_START) return 0;
  const overchargePower = power - OVERCHARGE_START;
  const maxOvercharge = OVERCHARGE_MAX - OVERCHARGE_START;
  return Math.min((overchargePower / maxOvercharge) * 100, 100);
}

// === SCATTER FUNCTIONS ===

/**
 * Calculate scatter radius based on power.
 * Smooth quadratic curve - no binary cliffs.
 * Overcharge has increasing penalty beyond max normal scatter.
 */
export function calculateScatterRadius(power: number): number {
  if (power > OVERCHARGE_START) {
    // Overcharge: scatter increases past normal max
    const overchargeFactor = (power - OVERCHARGE_START) / (OVERCHARGE_MAX - OVERCHARGE_START);
    return SCATTER_MAX + overchargeFactor * (SCATTER_OVERCHARGE_MAX - SCATTER_MAX);
  }

  // Normal: quadratic distance from perfect center
  const distanceFromCenter = Math.abs(power - PERFECT_ZONE_CENTER);
  const maxDistance = Math.max(PERFECT_ZONE_CENTER, 100 - PERFECT_ZONE_CENTER);
  const normalizedDistance = distanceFromCenter / maxDistance;
  const easedDistance = normalizedDistance * normalizedDistance; // Quadratic easing

  return SCATTER_MIN + easedDistance * (SCATTER_MAX - SCATTER_MIN);
}

/**
 * Apply scatter to target position.
 * Uses sqrt distribution for uniform area coverage (not clustered at center).
 *
 * @param targetX - Target X coordinate
 * @param targetY - Target Y coordinate
 * @param power - Power value (0-150)
 * @param rng - Random number generator (injectable for determinism)
 */
export function applyScatter(
  targetX: number,
  targetY: number,
  power: number,
  rng: RngFunction = Math.random
): ScatteredPosition {
  const radius = calculateScatterRadius(power);

  // Random angle for direction
  const angle = rng() * Math.PI * 2;

  // Use sqrt distribution for uniform area coverage
  // Without sqrt, points cluster toward center
  const distance = Math.sqrt(rng()) * radius;

  return {
    x: targetX + Math.cos(angle) * distance,
    y: targetY + Math.sin(angle) * distance,
  };
}

// === UI HELPER FUNCTIONS ===

/**
 * Get zone label for UI display.
 */
export function getZoneLabel(power: number): ZoneLabel {
  if (power > OVERCHARGE_START) return 'OVERCHARGE';
  if (power < PERFECT_ZONE_MIN) return 'WEAK';
  if (power > PERFECT_ZONE_MAX) return 'STRONG';
  return 'PERFECT';
}

/**
 * Get relative fill speed ratio (1.0 = base, <1 = slower, >1 = faster).
 */
export function getFillSpeedRatio(fillDuration: number): number {
  return FILL_DURATION_BASE_MS / fillDuration;
}

/**
 * Get speed label for UI display based on fill speed ratio.
 */
export function getSpeedLabel(fillSpeedRatio: number): SpeedLabel {
  if (fillSpeedRatio < SPEED_SLOW_THRESHOLD) return 'SLOW';
  if (fillSpeedRatio > SPEED_FAST_THRESHOLD) return 'FAST';
  return 'NORMAL';
}
