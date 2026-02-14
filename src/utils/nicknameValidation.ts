/**
 * Nickname Validation Utility
 *
 * Validates nicknames for length and profanity using tokenization-based
 * matching to avoid false positives (e.g., "Grass" won't match "ass").
 */

// Banned words as Set for O(1) lookup
const BANNED = new Set([
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy',
  'whore', 'slut', 'fag', 'nigger', 'nigga', 'retard',
]);

// Leetspeak normalization map (conservative to avoid false positives)
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
  '!': 'i',
};

/**
 * Normalize a single token (lowercase + leetspeak conversion)
 */
function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .split('')
    .map(c => LEET[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '');
}

/**
 * Validate a nickname for length and profanity
 */
export function validateNickname(
  nickname: string
): { valid: true } | { valid: false; error: string } {
  const trimmed = nickname.trim();

  // Length check
  if (trimmed.length < 1) {
    return { valid: false, error: 'Nickname cannot be empty' };
  }
  if (trimmed.length > 20) {
    return { valid: false, error: 'Nickname must be 20 characters or less' };
  }

  // Tokenize first, then normalize each token, then exact-match
  // This avoids false positives: "Grass" → token "grass" ≠ "ass"
  const tokens = trimmed
    .split(/[^a-z0-9@$!]+/i)
    .filter(Boolean)
    .map(normalizeToken);

  const hasProfanity = tokens.some(t => BANNED.has(t));

  if (hasProfanity) {
    return { valid: false, error: 'Nickname contains inappropriate language' };
  }

  // Also check collapsed tokens to catch "f.u.c.k" style obfuscation
  const collapsed = tokens.join('');
  if (BANNED.has(collapsed)) {
    return { valid: false, error: 'Nickname contains inappropriate language' };
  }

  return { valid: true };
}
