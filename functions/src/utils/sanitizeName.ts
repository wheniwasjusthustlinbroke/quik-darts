/**
 * Display Name Sanitization
 *
 * Unicode-safe allowlist sanitizer for user display names.
 * Allows international characters while blocking dangerous chars.
 *
 * Security:
 * - NFKC normalization prevents homograph attacks
 * - Strips control chars, zero-width, bidi overrides
 * - Allowlist approach (safer than blocklist)
 */

/**
 * Sanitize display name for safe storage and rendering.
 * NOTE: This is for display text only, NOT for RTDB path/key construction.
 * @param name - Raw input (may be any type)
 * @returns Sanitized string, max 20 chars, or 'Player' if invalid
 */
export function sanitizeDisplayName(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0) return 'Player';

  // Cap input length before normalize to prevent CPU burn on massive strings
  const raw = name.slice(0, 256);

  return raw
    // Normalize unicode (prevent homograph attacks)
    .normalize('NFKC')
    // Remove control chars, zero-width, bidi overrides, bidi isolates
    .replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028-\u202F\u202A-\u202E\u2066-\u2069\uFEFF]/gu, '')
    // Allowlist: Unicode letters, numbers, space, hyphen, underscore, period, apostrophe
    .replace(/[^\p{L}\p{N}\s\-_.']/gu, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20) || 'Player';
}
