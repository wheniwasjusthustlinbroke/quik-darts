/**
 * PowerBar Component
 *
 * Visual power indicator for dart throws.
 * Shows current power level, perfect zone, overcharge state, and speed indicator.
 */

import React, { useMemo } from 'react';
import {
  PERFECT_ZONE_MIN,
  PERFECT_ZONE_MAX,
  isInPerfectZone,
  type SpeedLabel,
} from '../../throwing/throwMeter';
import './PowerBar.css';

interface PowerBarProps {
  /** Current power (0-100, clamped for display) */
  power: number;
  /** Whether currently charging */
  isCharging: boolean;
  /** Whether in overcharge zone */
  isOvercharging?: boolean;
  /** Overcharge percentage (0-100) */
  overchargePercent?: number;
  /** Fill speed ratio for indicator */
  fillSpeedRatio?: number;
  /** Speed label for explicit UI feedback */
  speedLabel?: SpeedLabel;
  /** Show perfect zone indicator */
  showPerfectZone?: boolean;
  /** Orientation of the bar */
  orientation?: 'horizontal' | 'vertical';
  /** Additional CSS class */
  className?: string;
}

export const PowerBar: React.FC<PowerBarProps> = ({
  power,
  isCharging,
  isOvercharging = false,
  overchargePercent = 0,
  fillSpeedRatio = 1,
  speedLabel = 'NORMAL',
  showPerfectZone = true,
  orientation = 'vertical',
  className = '',
}) => {
  const inPerfectZone = isInPerfectZone(power);
  const perfectZoneSize = PERFECT_ZONE_MAX - PERFECT_ZONE_MIN;

  // Determine power bar color
  const powerColor = useMemo(() => {
    if (isOvercharging) return 'var(--color-warning, #ff8800)';
    if (inPerfectZone) return 'var(--color-success)';
    if (power < 30 || power > 70) return 'var(--color-error)';
    return 'var(--color-accent)';
  }, [power, inPerfectZone, isOvercharging]);

  // Bar fill style
  const barStyle = useMemo(() => {
    if (orientation === 'vertical') {
      return { height: `${power}%` };
    }
    return { width: `${power}%` };
  }, [power, orientation]);

  // Speed indicator class
  const speedClass = useMemo(() => {
    if (fillSpeedRatio < 0.96) return 'power-bar--slow';
    if (fillSpeedRatio > 1.04) return 'power-bar--fast';
    return '';
  }, [fillSpeedRatio]);

  // Build class list
  const classNames = [
    'power-bar',
    `power-bar--${orientation}`,
    isCharging ? 'power-bar--charging' : '',
    isOvercharging ? 'power-bar--overcharging' : '',
    speedClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames}>
      {/* Speed indicator label - only show while charging */}
      {isCharging && (
        <div className={`power-bar__speed-label power-bar__speed-label--${speedLabel.toLowerCase()}`}>
          {speedLabel}
        </div>
      )}

      <div className="power-bar__track">
        {/* Perfect zone indicator */}
        {showPerfectZone && (
          <div
            className="power-bar__perfect-zone"
            style={
              orientation === 'vertical'
                ? {
                    bottom: `${PERFECT_ZONE_MIN}%`,
                    height: `${perfectZoneSize}%`,
                  }
                : {
                    left: `${PERFECT_ZONE_MIN}%`,
                    width: `${perfectZoneSize}%`,
                  }
            }
          />
        )}

        {/* Power fill */}
        <div
          className={`power-bar__fill ${isOvercharging ? 'power-bar__fill--overcharge' : ''}`}
          style={{
            ...barStyle,
            backgroundColor: powerColor,
          }}
        />

        {/* Power indicator line */}
        <div
          className="power-bar__indicator"
          style={
            orientation === 'vertical'
              ? { bottom: `${power}%` }
              : { left: `${power}%` }
          }
        />
      </div>

      {/* Power value label */}
      <div className="power-bar__label">
        <span className="power-bar__value">{Math.round(power)}</span>
        <span className="power-bar__unit">%</span>
      </div>

      {/* Perfect zone label - show when in perfect zone while charging */}
      {inPerfectZone && isCharging && !isOvercharging && (
        <div className="power-bar__perfect-label">PERFECT</div>
      )}

      {/* Overcharge indicator - critical for UX */}
      {isOvercharging && isCharging && (
        <div className="power-bar__overcharge-indicator">
          <span className="power-bar__overcharge-label">OVERCHARGE</span>
          <div className="power-bar__overcharge-bar">
            <div
              className="power-bar__overcharge-fill"
              style={{ width: `${overchargePercent}%` }}
            />
          </div>
          <span className="power-bar__overcharge-percent">
            {Math.round(overchargePercent)}%
          </span>
        </div>
      )}
    </div>
  );
};

export default PowerBar;
