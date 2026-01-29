/**
 * Difficulty Selector Component
 *
 * Allows selection of game difficulty level.
 * Reusable for AI games, PvP Expert Mode, and Settings.
 */

import { DIFFICULTY_CONFIGS, type GameDifficulty } from '../utils/difficulty';
import './DifficultySelector.css';

interface DifficultySelectorProps {
  value: GameDifficulty;
  onChange: (difficulty: GameDifficulty) => void;
  disabled?: boolean;
}

export function DifficultySelector({
  value,
  onChange,
  disabled = false,
}: DifficultySelectorProps) {
  return (
    <div className="difficulty-selector">
      <div className="difficulty-selector__label">Difficulty</div>
      <div className="difficulty-selector__options">
        {DIFFICULTY_CONFIGS.map((config) => (
          <button
            key={config.key}
            type="button"
            className={`difficulty-selector__btn ${
              value === config.key ? 'difficulty-selector__btn--active' : ''
            } difficulty-selector__btn--${config.key}`}
            onClick={() => onChange(config.key)}
            disabled={disabled}
            title={config.description}
          >
            {config.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DifficultySelector;
