/**
 * useTheme Hook
 *
 * Manages dartboard theme selection with localStorage persistence.
 */

import { useCallback, useMemo } from 'react';
import { useThemeSettings } from './useLocalStorage';
import {
  DARTBOARD_THEMES,
  THEME_CLASSIC,
  THEME_NEON_GLOW,
  NEON_COLORS,
  getThemeById,
  getNeonColors,
} from '../constants/themes';
import type { DartboardTheme, ThemeId, NeonColor } from '../types';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  premiumOnly?: boolean;
}

export interface UseThemeReturn {
  theme: DartboardTheme;
  themeId: ThemeId;
  neonColor: NeonColor;
  availableThemes: ThemeOption[];
  selectTheme: (id: ThemeId) => void;
  selectNeonColor: (color: NeonColor) => void;
}

// Validate themeId from localStorage - don't trust user data
function isValidThemeId(id: unknown): id is ThemeId {
  return typeof id === 'string' && id in DARTBOARD_THEMES;
}

// Validate neonColor from localStorage - don't trust user data
function isValidNeonColor(color: unknown): color is NeonColor {
  return typeof color === 'string' && Object.values(NEON_COLORS).includes(color as NeonColor);
}

export function useTheme(): UseThemeReturn {
  const [settings, setSettings] = useThemeSettings();

  // Validate and get safe themeId (fallback to classic if invalid)
  const safeThemeId = isValidThemeId(settings.themeId)
    ? settings.themeId
    : THEME_CLASSIC.id as ThemeId;

  // If user hasn't picked a neon color, default to CYAN for neon theme
  const safeNeonColor = isValidNeonColor(settings.neonColor)
    ? settings.neonColor
    : NEON_COLORS.CYAN;

  // Get the actual theme object based on validated themeId
  const theme = useMemo((): DartboardTheme => {
    const baseTheme = getThemeById(safeThemeId);

    // Apply neon color customization if it's the neon theme
    if (safeThemeId === THEME_NEON_GLOW.id) {
      const neonColors = getNeonColors(safeNeonColor);
      return {
        ...baseTheme,
        colors: {
          ...baseTheme.colors,
          wire: neonColors.primary,
          numbers: neonColors.primary,
        },
        wireStyle: {
          ...baseTheme.wireStyle,
          glowColor: neonColors.glow,
        },
      };
    }

    return baseTheme;
  }, [safeThemeId, safeNeonColor]);

  // List of available themes for UI
  const availableThemes = useMemo((): ThemeOption[] => {
    return Object.values(DARTBOARD_THEMES).map((t) => ({
      id: t.id as ThemeId,
      name: t.name,
      description: t.description,
      premiumOnly: t.premiumOnly,
    }));
  }, []);

  // Select a theme
  const selectTheme = useCallback(
    (id: ThemeId) => {
      setSettings((prev) => ({
        ...prev,
        themeId: id,
        savedAt: new Date().toISOString(),
      }));
    },
    [setSettings]
  );

  // Select neon color (for neon_glow theme)
  const selectNeonColor = useCallback(
    (color: NeonColor) => {
      setSettings((prev) => ({
        ...prev,
        neonColor: color,
        savedAt: new Date().toISOString(),
      }));
    },
    [setSettings]
  );

  return {
    theme,
    themeId: safeThemeId,
    neonColor: safeNeonColor,
    availableThemes,
    selectTheme,
    selectNeonColor,
  };
}

export default useTheme;
