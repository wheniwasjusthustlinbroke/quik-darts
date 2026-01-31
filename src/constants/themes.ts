/**
 * Dartboard Theme System
 *
 * All theme configurations for the dartboard.
 */

import type { ThemeId, NeonColor, DartboardTheme } from '../types';

// Theme IDs
export const THEME_IDS = {
  CLASSIC: 'classic',
  PRO_WIRE: 'pro_wire',
  NEON_GLOW: 'neon_glow',
  GOLD_ELITE: 'gold_elite',
  STEALTH: 'stealth',
} as const;

// Neon color options
export const NEON_COLORS = {
  CYAN: 'cyan',
  MAGENTA: 'magenta',
  GREEN: 'green',
  ORANGE: 'orange',
} as const;

// Classic theme - Traditional dartboard
export const THEME_CLASSIC: DartboardTheme = {
  id: 'classic',
  name: 'Classic',
  description: 'Traditional dartboard appearance',
  colors: {
    segment1: '#0a0a0a',
    segment2: '#f5f0e8',
    double: '#b8232a',
    triple: '#0d6b2e',
    bullOuter: '#0d6b2e',
    bullInner: '#b8232a',
    wire: '#888888',
    numbers: '#f5f0e8',
    background: '#1a1a1a',
    frame: '#1a4a6e',
  },
  wireStyle: {
    width: 1.0,
    glow: false,
  },
};

// Pro Wire theme - Tournament style
export const THEME_PRO_WIRE: DartboardTheme = {
  id: 'pro_wire',
  name: 'Pro Wire',
  description: 'Tournament style with thin metal wire dividers',
  colors: {
    segment1: '#0a0a0a',
    segment2: '#e8e4dc',
    double: '#c41e3a',
    triple: '#1a8b45',
    bullOuter: '#1a8b45',
    bullInner: '#c41e3a',
    wire: '#d4d4d4',
    numbers: '#ffffff',
    background: '#1a1a1a',
    frame: '#2a5a8e',
  },
  wireStyle: {
    width: 0.8,
    glow: false,
  },
};

// Neon Glow theme - Dark with glowing wires
export const THEME_NEON_GLOW: DartboardTheme = {
  id: 'neon_glow',
  name: 'Neon Glow',
  description: 'Dark board with glowing neon wires',
  colors: {
    segment1: '#0a0a12',
    segment2: '#1a1a28',
    double: '#2a0a1a',
    triple: '#0a1a1a',
    bullOuter: '#0a1a1a',
    bullInner: '#2a0a1a',
    wire: '#00ffff',
    numbers: '#00ffff',
    background: '#050508',
    frame: '#0a2a4a',
  },
  wireStyle: {
    width: 1.2,
    glow: true,
    glowColor: 'rgba(0, 255, 255, 0.6)',
    glowIntensity: 10,
  },
};

// Gold Elite theme - Premium golden look
export const THEME_GOLD_ELITE: DartboardTheme = {
  id: 'gold_elite',
  name: 'Gold Elite',
  description: 'Premium golden accents',
  colors: {
    segment1: '#1a1408',
    segment2: '#2a2010',
    double: '#d4a03a',
    triple: '#e8b94a',
    bullOuter: '#d4a03a',
    bullInner: '#e8b94a',
    wire: '#d4a03a',
    numbers: '#d4a03a',
    background: '#0a0806',
    frame: '#3a2a1a',
  },
  wireStyle: {
    width: 1.0,
    glow: true,
    glowColor: 'rgba(212, 160, 58, 0.4)',
    glowIntensity: 5,
  },
  premiumOnly: true,
};

// Stealth theme - Dark minimal look
export const THEME_STEALTH: DartboardTheme = {
  id: 'stealth',
  name: 'Stealth',
  description: 'Dark minimal look',
  colors: {
    segment1: '#0a0a0a',
    segment2: '#1a1a1a',
    double: '#2a2a2a',
    triple: '#3a3a3a',
    bullOuter: '#2a2a2a',
    bullInner: '#3a3a3a',
    wire: '#4a4a4a',
    numbers: '#6a6a6a',
    background: '#050505',
    frame: '#1a1a1a',
  },
  wireStyle: {
    width: 0.5,
    glow: false,
  },
};

// All themes
export const DARTBOARD_THEMES: Record<ThemeId, DartboardTheme> = {
  classic: THEME_CLASSIC,
  pro_wire: THEME_PRO_WIRE,
  neon_glow: THEME_NEON_GLOW,
  gold_elite: THEME_GOLD_ELITE,
  stealth: THEME_STEALTH,
};

// Get theme by ID
export function getThemeById(themeId: ThemeId): DartboardTheme {
  return DARTBOARD_THEMES[themeId] || THEME_CLASSIC;
}

// Get neon colors for neon theme
export function getNeonColors(neonColor: NeonColor) {
  const colors = {
    cyan: { primary: '#00ffff', secondary: '#00d4ff', glow: 'rgba(0, 255, 255, 0.6)' },
    magenta: { primary: '#ff00ff', secondary: '#ff44aa', glow: 'rgba(255, 0, 255, 0.6)' },
    green: { primary: '#00ff66', secondary: '#44ff88', glow: 'rgba(0, 255, 102, 0.6)' },
    orange: { primary: '#ff8800', secondary: '#ffaa44', glow: 'rgba(255, 136, 0, 0.6)' },
  };
  return colors[neonColor] || colors.cyan;
}
