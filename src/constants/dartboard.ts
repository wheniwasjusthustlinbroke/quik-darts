/**
 * Dartboard Constants
 *
 * All dartboard-related constants and configurations.
 */

// Board dimensions
export const BOARD_SIZE = 500;
export const CENTER = BOARD_SIZE / 2;

// Segment values in clockwise order starting from 20 at top
export const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

// Segment colors (alternating)
export const SEGMENT_COLORS = ['#0a0a0a', '#f5f0e8'] as const; // Deep black and cream

// Ring radii (from center outward)
export const INNER_BULL = 10;
export const OUTER_BULL = 20;
export const TRIPLE_INNER = 119;
export const TRIPLE_OUTER = 134;
export const DOUBLE_INNER = 200;
export const DOUBLE_OUTER = 215;

// Frame ring (blue surround)
export const FRAME_INNER = 218;
export const FRAME_OUTER = 235;
export const NUMBER_RADIUS = 248;

// Matchmaking timing
export const MATCHMAKING_TIMINGS = Object.freeze({
  FOUND_TO_INTRO_DELAY_MS: 700,
  INTRO_DURATION_MS: 2500,
});

// Checkout suggestions for common scores
export const CHECKOUT_ROUTES: Record<number, string> = {
  170: 'T20 T20 Bull',
  167: 'T20 T19 Bull',
  164: 'T20 T18 Bull',
  161: 'T20 T17 Bull',
  160: 'T20 T20 D20',
  158: 'T20 T20 D19',
  157: 'T20 T19 D20',
  156: 'T20 T20 D18',
  155: 'T20 T19 D19',
  154: 'T20 T18 D20',
  153: 'T20 T19 D18',
  152: 'T20 T20 D16',
  151: 'T20 T17 D20',
  150: 'T20 T18 D18',
  149: 'T20 T19 D16',
  148: 'T20 T20 D14',
  147: 'T20 T17 D18',
  146: 'T20 T18 D16',
  145: 'T20 T19 D14',
  144: 'T20 T20 D12',
  143: 'T20 T17 D16',
  142: 'T20 T14 D20',
  141: 'T20 T19 D12',
  140: 'T20 T20 D10',
  139: 'T20 T13 D20',
  138: 'T20 T18 D12',
  137: 'T20 T19 D10',
  136: 'T20 T20 D8',
  135: 'T20 T17 D12',
  134: 'T20 T14 D16',
  133: 'T20 T19 D8',
  132: 'T20 T16 D12',
  131: 'T20 T13 D16',
  130: 'T20 T18 D8',
  129: 'T19 T16 D12',
  128: 'T18 T14 D16',
  127: 'T20 T17 D8',
  126: 'T19 T19 D6',
  125: 'T18 T19 D7',
  124: 'T20 T14 D11',
  123: 'T19 T16 D9',
  122: 'T18 T18 D7',
  121: 'T20 T11 D14',
  120: 'T20 S20 D20',
  119: 'T19 T12 D13',
  118: 'T20 S18 D20',
  117: 'T20 S17 D20',
  116: 'T20 S16 D20',
  115: 'T20 S15 D20',
  114: 'T20 S14 D20',
  113: 'T20 S13 D20',
  112: 'T20 T12 D8',
  111: 'T20 S11 D20',
  110: 'T20 S10 D20',
  109: 'T20 S9 D20',
  108: 'T20 S8 D20',
  107: 'T20 S7 D20',
  106: 'T20 S6 D20',
  105: 'T20 S5 D20',
  104: 'T20 S4 D20',
  103: 'T20 S3 D20',
  102: 'T20 S2 D20',
  101: 'T20 S1 D20',
  100: 'T20 D20',
  99: 'T19 S2 D20',
  98: 'T20 D19',
  97: 'T19 D20',
  96: 'T20 D18',
  95: 'T19 D19',
  94: 'T18 D20',
  93: 'T19 D18',
  92: 'T20 D16',
  91: 'T17 D20',
  90: 'T18 D18',
  89: 'T19 D16',
  88: 'T20 D14',
  87: 'T17 D18',
  86: 'T18 D16',
  85: 'T15 D20',
  84: 'T20 D12',
  83: 'T17 D16',
  82: 'T14 D20',
  81: 'T19 D12',
  80: 'T20 D10',
  79: 'T13 D20',
  78: 'T18 D12',
  77: 'T19 D10',
  76: 'T20 D8',
  75: 'T17 D12',
  74: 'T14 D16',
  73: 'T19 D8',
  72: 'T16 D12',
  71: 'T13 D16',
  70: 'T18 D8',
  69: 'T19 D6',
  68: 'T20 D4',
  67: 'T17 D8',
  66: 'T10 D18',
  65: 'T19 D4',
  64: 'T16 D8',
  63: 'T13 D12',
  62: 'T10 D16',
  61: 'T15 D8',
  60: 'S20 D20',
  59: 'S19 D20',
  58: 'S18 D20',
  57: 'S17 D20',
  56: 'S16 D20',
  55: 'S15 D20',
  54: 'S14 D20',
  53: 'S13 D20',
  52: 'S12 D20',
  51: 'S11 D20',
  50: 'S10 D20',
  49: 'S9 D20',
  48: 'S8 D20',
  47: 'S7 D20',
  46: 'S6 D20',
  45: 'S5 D20',
  44: 'S4 D20',
  43: 'S3 D20',
  42: 'S2 D20',
  41: 'S1 D20',
  40: 'D20',
  38: 'D19',
  36: 'D18',
  34: 'D17',
  32: 'D16',
  30: 'D15',
  28: 'D14',
  26: 'D13',
  24: 'D12',
  22: 'D11',
  20: 'D10',
  18: 'D9',
  16: 'D8',
  14: 'D7',
  12: 'D6',
  10: 'D5',
  8: 'D4',
  6: 'D3',
  4: 'D2',
  2: 'D1',
};

// Skill level presets
export const SKILL_LEVELS = {
  BEGINNER: 40,
  INTERMEDIATE: 60,
  ADVANCED: 80,
  EXPERT: 95,
} as const;

// AI difficulty settings
export const AI_DIFFICULTY_SKILL = {
  easy: 35,
  medium: 55,
  hard: 75,
  expert: 90,
} as const;
