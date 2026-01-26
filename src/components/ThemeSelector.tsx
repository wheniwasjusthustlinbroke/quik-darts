/**
 * ThemeSelector Component
 *
 * Modal for selecting dartboard theme.
 */

import { CloseIcon } from './icons';
import { DARTBOARD_THEMES } from '../constants/themes';
import type { ThemeId } from '../types';

interface ThemeSelectorProps {
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  onClose: () => void;
}

// Color swatch preview for each theme
function ThemePreview({ themeId }: { themeId: ThemeId }) {
  const theme = DARTBOARD_THEMES[themeId];
  if (!theme) return null;

  return (
    <div className="theme-preview">
      <div
        className="theme-preview__swatch"
        style={{ backgroundColor: theme.colors.segment1 }}
      />
      <div
        className="theme-preview__swatch"
        style={{ backgroundColor: theme.colors.segment2 }}
      />
      <div
        className="theme-preview__swatch"
        style={{ backgroundColor: theme.colors.double }}
      />
      <div
        className="theme-preview__swatch"
        style={{ backgroundColor: theme.colors.triple }}
      />
      <div
        className="theme-preview__swatch"
        style={{ backgroundColor: theme.colors.wire }}
      />
    </div>
  );
}

export function ThemeSelector({
  currentThemeId,
  onSelectTheme,
  onClose,
}: ThemeSelectorProps) {
  const themes = Object.values(DARTBOARD_THEMES);

  return (
    <div className="theme-selector-overlay" onClick={onClose}>
      <div className="theme-selector" onClick={(e) => e.stopPropagation()}>
        <button className="theme-selector__close" onClick={onClose}>
          <CloseIcon size={24} />
        </button>

        <h2 className="theme-selector__title">Dartboard Theme</h2>

        <div className="theme-selector__options">
          {themes.map((theme) => {
            const isSelected = currentThemeId === theme.id;
            const isPremium = theme.premiumOnly;

            return (
              <button
                key={theme.id}
                className={`theme-option ${isSelected ? 'theme-option--selected' : ''} ${isPremium ? 'theme-option--premium' : ''}`}
                onClick={() => onSelectTheme(theme.id as ThemeId)}
              >
                <div className="theme-option__info">
                  <span className="theme-option__name">
                    {theme.name}
                    {isPremium && <span className="theme-option__badge">Premium</span>}
                  </span>
                  <span className="theme-option__description">{theme.description}</span>
                </div>
                <ThemePreview themeId={theme.id as ThemeId} />
                {isSelected && <span className="theme-option__check">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ThemeSelector;
