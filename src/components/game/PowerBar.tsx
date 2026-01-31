/**
 * PowerBar Component - Horizontal Oscillating Layout
 *
 * Matches legacy quikdarts.com design:
 * - Horizontal bar below dartboard
 * - WEAK | PERFECT | STRONG labels
 * - Dynamic perfect zone width (shrinks on hits)
 */

import React, { useMemo } from 'react';
import {
  PERFECT_ZONE_CENTER,
  isInPerfectZone as checkInPerfectZone,
} from '../../throwing/legacyMeter';
import './PowerBar.css';

interface PowerBarProps {
  /** Current power (0-100) */
  power: number;
  /** Whether currently charging */
  isCharging: boolean;
  /** Perfect zone width (dynamic, based on hits) */
  perfectZoneWidth: number;
  /** Additional CSS class */
  className?: string;
}

export const PowerBar: React.FC<PowerBarProps> = ({
  power,
  isCharging,
  perfectZoneWidth,
  className = '',
}) => {
  const inPerfectZone = checkInPerfectZone(power, perfectZoneWidth);
  const perfectZoneLeft = PERFECT_ZONE_CENTER - perfectZoneWidth / 2;

  // Determine fill color
  const fillColor = useMemo(() => {
    if (inPerfectZone) return 'var(--color-success)';
    if (power < 30 || power > 70) return 'var(--color-error)';
    return 'var(--color-accent)';
  }, [power, inPerfectZone]);

  // Shrink indicator text
  const shrinkText = useMemo(() => {
    if (perfectZoneWidth < 10) {
      return ` (-${Math.round(10 - perfectZoneWidth)}%)`;
    }
    return '';
  }, [perfectZoneWidth]);

  return (
    <div className={`power-bar power-bar--horizontal ${className}`}>
      <div className="power-bar__track">
        {/* Perfect zone indicator */}
        <div
          className="power-bar__perfect-zone"
          style={{
            left: `${perfectZoneLeft}%`,
            width: `${perfectZoneWidth}%`,
          }}
        />

        {/* Center line at 50% */}
        <div className="power-bar__center-line" />

        {/* Power fill */}
        <div
          className={`power-bar__fill ${inPerfectZone ? 'power-bar__fill--perfect' : ''}`}
          style={{
            width: `${power}%`,
            backgroundColor: fillColor,
            transition: isCharging ? 'none' : 'width 0.2s',
          }}
        />
      </div>

      {/* WEAK | PERFECT | STRONG labels */}
      <div className="power-bar__labels">
        <span className="power-bar__label--weak">WEAK</span>
        <span className="power-bar__label--perfect">
          PERFECT{shrinkText}
        </span>
        <span className="power-bar__label--strong">STRONG</span>
      </div>

      {/* Perfect zone feedback - show when in zone while charging */}
      {inPerfectZone && isCharging && (
        <div className="power-bar__perfect-feedback">PERFECT!</div>
      )}
    </div>
  );
};

export default PowerBar;
