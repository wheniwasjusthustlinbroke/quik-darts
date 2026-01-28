/**
 * Weekly Challenge Badge
 *
 * Compact weekly challenge display for the landing page.
 * Shows challenge icon, name, progress, and countdown timer.
 */

import { useWeeklyChallenge } from '../hooks';
import './WeeklyChallengeBadge.css';

interface WeeklyChallengeBadgeProps {
  onClick?: () => void;
}

export function WeeklyChallengeBadge({ onClick }: WeeklyChallengeBadgeProps) {
  const { challenge, progress, completed, timeRemaining } = useWeeklyChallenge();

  const progressPercent = progress?.percentage ?? 0;

  return (
    <button className="weekly-badge" onClick={onClick} type="button">
      <div className="weekly-badge__icon">
        {completed ? '✓' : challenge.icon}
      </div>
      <div className="weekly-badge__content">
        <div className="weekly-badge__header">
          <span className="weekly-badge__label">Weekly Challenge</span>
          <span className="weekly-badge__timer">{timeRemaining}</span>
        </div>
        <div className="weekly-badge__name">{challenge.name}</div>
        <div className="weekly-badge__progress-bar">
          <div
            className="weekly-badge__progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="weekly-badge__progress-text">
          {progress ? `${progress.current} / ${progress.target}` : '0 / 0'}
          {completed && <span className="weekly-badge__complete">Complete!</span>}
        </div>
      </div>
    </button>
  );
}

export default WeeklyChallengeBadge;
