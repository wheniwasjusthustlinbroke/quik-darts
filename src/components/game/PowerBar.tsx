/**
 * PowerBar Component
 *
 * Visual power indicator for dart throws.
 * Shows current power level and perfect zone.
 */

import React, { useMemo } from 'react';
import './PowerBar.css';

interface PowerBarProps {
  power: number; // 0-100
  isCharging: boolean;
  showPerfectZone?: boolean;
  perfectZoneMin?: number;
  perfectZoneMax?: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const PowerBar: React.FC<PowerBarProps> = ({
  power,
  isCharging,
  showPerfectZone = true,
  perfectZoneMin = 45,
  perfectZoneMax = 55,
  orientation = 'vertical',
  className = '',
}) => {
  const isInPerfectZone = power >= perfectZoneMin && power <= perfectZoneMax;

  const powerColor = useMemo(() => {
    if (isInPerfectZone) return 'var(--color-success)';
    if (power < 30 || power > 70) return 'var(--color-error)';
    return 'var(--color-accent)';
  }, [power, isInPerfectZone]);

  const barStyle = useMemo(() => {
    if (orientation === 'vertical') {
      return { height: `${power}%` };
    }
    return { width: `${power}%` };
  }, [power, orientation]);

  return (
    <div
      className={`power-bar power-bar--${orientation} ${isCharging ? 'power-bar--charging' : ''} ${className}`}
    >
      <div className="power-bar__track">
        {/* Perfect zone indicator */}
        {showPerfectZone && (
          <div
            className="power-bar__perfect-zone"
            style={
              orientation === 'vertical'
                ? {
                    bottom: `${perfectZoneMin}%`,
                    height: `${perfectZoneMax - perfectZoneMin}%`,
                  }
                : {
                    left: `${perfectZoneMin}%`,
                    width: `${perfectZoneMax - perfectZoneMin}%`,
                  }
            }
          />
        )}

        {/* Power fill */}
        <div
          className="power-bar__fill"
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

      {/* Perfect zone label */}
      {isInPerfectZone && isCharging && (
        <div className="power-bar__perfect-label">PERFECT</div>
      )}
    </div>
  );
};

export default PowerBar;
