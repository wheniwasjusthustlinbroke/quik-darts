/**
 * Rhythm Indicator Component
 *
 * Visual feedback for throw rhythm in online games.
 * Shows: flow, perfect, neutral, rushing, hesitating
 */

import type { RhythmState } from '../../types';
import './RhythmIndicator.css';

interface RhythmIndicatorProps {
  state: RhythmState;
}

const RHYTHM_CONFIG: Record<RhythmState, { label: string; icon: string }> = {
  flow: { label: 'IN THE ZONE!', icon: '🔥' },
  perfect: { label: 'PERFECT RHYTHM', icon: '🎯' },
  neutral: { label: '', icon: '' },
  rushing: { label: 'SLOW DOWN', icon: '⚡' },
  hesitating: { label: 'KEEP MOVING', icon: '⏳' },
};

export function RhythmIndicator({ state }: RhythmIndicatorProps) {
  // Don't render when neutral
  if (state === 'neutral') {
    return null;
  }

  const config = RHYTHM_CONFIG[state];

  return (
    <div className={`rhythm-indicator rhythm-indicator--${state}`}>
      <span className="rhythm-indicator__icon">{config.icon}</span>
      <span className="rhythm-indicator__label">{config.label}</span>
    </div>
  );
}

export default RhythmIndicator;
