/**
 * Dartboard Component
 *
 * SVG-based dartboard with theme support and dart visualization.
 */

import React, { useMemo, useCallback } from 'react';
import type { Position, DartPosition, DartboardTheme } from '../../types';
import {
  BOARD_SIZE,
  CENTER,
  SEGMENTS,
  INNER_BULL,
  OUTER_BULL,
  TRIPLE_INNER,
  TRIPLE_OUTER,
  DOUBLE_INNER,
  DOUBLE_OUTER,
  FRAME_INNER,
  FRAME_OUTER,
  NUMBER_RADIUS,
  THEME_CLASSIC,
} from '../../constants';

interface DartboardProps {
  theme?: DartboardTheme;
  dartPositions?: DartPosition[];
  aimPosition?: Position | null;
  aimWobble?: Position;
  showAimCursor?: boolean;
  onBoardClick?: (x: number, y: number) => void;
  onBoardMove?: (x: number, y: number) => void;
  onBoardLeave?: () => void;
  // Power meter handlers (primary input for hold/release)
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerLeave?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onContextMenu?: (e: React.MouseEvent<SVGSVGElement>) => void;
  disabled?: boolean;
  className?: string;
}

export const Dartboard: React.FC<DartboardProps> = ({
  theme = THEME_CLASSIC,
  dartPositions = [],
  aimPosition = null,
  aimWobble = { x: 0, y: 0 },
  showAimCursor = false,
  onBoardClick,
  onBoardMove,
  onBoardLeave,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onContextMenu,
  disabled = false,
  className = '',
}) => {
  const colors = theme.colors;
  const wireStyle = theme.wireStyle;

  // Generate segment paths
  const segments = useMemo(() => {
    const paths: React.ReactNode[] = [];
    const segmentAngle = 360 / 20;

    SEGMENTS.forEach((_value, index) => {
      const startAngle = ((index * segmentAngle - segmentAngle / 2 - 90) * Math.PI) / 180;
      const endAngle = ((index * segmentAngle + segmentAngle / 2 - 90) * Math.PI) / 180;

      const isEven = index % 2 === 0;
      const segmentColor = isEven ? colors.segment1 : colors.segment2;
      const doubleTripleColor = isEven ? colors.double : colors.triple;

      // Single segment (between outer bull and triple)
      const singleInnerX1 = CENTER + OUTER_BULL * Math.cos(startAngle);
      const singleInnerY1 = CENTER + OUTER_BULL * Math.sin(startAngle);
      const singleInnerX2 = CENTER + OUTER_BULL * Math.cos(endAngle);
      const singleInnerY2 = CENTER + OUTER_BULL * Math.sin(endAngle);
      const singleOuterX1 = CENTER + TRIPLE_INNER * Math.cos(startAngle);
      const singleOuterY1 = CENTER + TRIPLE_INNER * Math.sin(startAngle);
      const singleOuterX2 = CENTER + TRIPLE_INNER * Math.cos(endAngle);
      const singleOuterY2 = CENTER + TRIPLE_INNER * Math.sin(endAngle);

      paths.push(
        <path
          key={`single-inner-${index}`}
          d={`M ${singleInnerX1} ${singleInnerY1}
              A ${OUTER_BULL} ${OUTER_BULL} 0 0 1 ${singleInnerX2} ${singleInnerY2}
              L ${singleOuterX2} ${singleOuterY2}
              A ${TRIPLE_INNER} ${TRIPLE_INNER} 0 0 0 ${singleOuterX1} ${singleOuterY1}
              Z`}
          fill={segmentColor}
        />
      );

      // Triple ring
      const tripleInnerX1 = CENTER + TRIPLE_INNER * Math.cos(startAngle);
      const tripleInnerY1 = CENTER + TRIPLE_INNER * Math.sin(startAngle);
      const tripleInnerX2 = CENTER + TRIPLE_INNER * Math.cos(endAngle);
      const tripleInnerY2 = CENTER + TRIPLE_INNER * Math.sin(endAngle);
      const tripleOuterX1 = CENTER + TRIPLE_OUTER * Math.cos(startAngle);
      const tripleOuterY1 = CENTER + TRIPLE_OUTER * Math.sin(startAngle);
      const tripleOuterX2 = CENTER + TRIPLE_OUTER * Math.cos(endAngle);
      const tripleOuterY2 = CENTER + TRIPLE_OUTER * Math.sin(endAngle);

      paths.push(
        <path
          key={`triple-${index}`}
          d={`M ${tripleInnerX1} ${tripleInnerY1}
              A ${TRIPLE_INNER} ${TRIPLE_INNER} 0 0 1 ${tripleInnerX2} ${tripleInnerY2}
              L ${tripleOuterX2} ${tripleOuterY2}
              A ${TRIPLE_OUTER} ${TRIPLE_OUTER} 0 0 0 ${tripleOuterX1} ${tripleOuterY1}
              Z`}
          fill={doubleTripleColor}
        />
      );

      // Single segment (between triple and double)
      const singleMidInnerX1 = CENTER + TRIPLE_OUTER * Math.cos(startAngle);
      const singleMidInnerY1 = CENTER + TRIPLE_OUTER * Math.sin(startAngle);
      const singleMidInnerX2 = CENTER + TRIPLE_OUTER * Math.cos(endAngle);
      const singleMidInnerY2 = CENTER + TRIPLE_OUTER * Math.sin(endAngle);
      const singleMidOuterX1 = CENTER + DOUBLE_INNER * Math.cos(startAngle);
      const singleMidOuterY1 = CENTER + DOUBLE_INNER * Math.sin(startAngle);
      const singleMidOuterX2 = CENTER + DOUBLE_INNER * Math.cos(endAngle);
      const singleMidOuterY2 = CENTER + DOUBLE_INNER * Math.sin(endAngle);

      paths.push(
        <path
          key={`single-outer-${index}`}
          d={`M ${singleMidInnerX1} ${singleMidInnerY1}
              A ${TRIPLE_OUTER} ${TRIPLE_OUTER} 0 0 1 ${singleMidInnerX2} ${singleMidInnerY2}
              L ${singleMidOuterX2} ${singleMidOuterY2}
              A ${DOUBLE_INNER} ${DOUBLE_INNER} 0 0 0 ${singleMidOuterX1} ${singleMidOuterY1}
              Z`}
          fill={segmentColor}
        />
      );

      // Double ring
      const doubleInnerX1 = CENTER + DOUBLE_INNER * Math.cos(startAngle);
      const doubleInnerY1 = CENTER + DOUBLE_INNER * Math.sin(startAngle);
      const doubleInnerX2 = CENTER + DOUBLE_INNER * Math.cos(endAngle);
      const doubleInnerY2 = CENTER + DOUBLE_INNER * Math.sin(endAngle);
      const doubleOuterX1 = CENTER + DOUBLE_OUTER * Math.cos(startAngle);
      const doubleOuterY1 = CENTER + DOUBLE_OUTER * Math.sin(startAngle);
      const doubleOuterX2 = CENTER + DOUBLE_OUTER * Math.cos(endAngle);
      const doubleOuterY2 = CENTER + DOUBLE_OUTER * Math.sin(endAngle);

      paths.push(
        <path
          key={`double-${index}`}
          d={`M ${doubleInnerX1} ${doubleInnerY1}
              A ${DOUBLE_INNER} ${DOUBLE_INNER} 0 0 1 ${doubleInnerX2} ${doubleInnerY2}
              L ${doubleOuterX2} ${doubleOuterY2}
              A ${DOUBLE_OUTER} ${DOUBLE_OUTER} 0 0 0 ${doubleOuterX1} ${doubleOuterY1}
              Z`}
          fill={doubleTripleColor}
        />
      );
    });

    return paths;
  }, [colors]);

  // Generate wire lines
  const wireLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const segmentAngle = 360 / 20;
    const wireColor = colors.wire;
    const strokeWidth = wireStyle.width;

    // Radial wires between segments
    SEGMENTS.forEach((_, index) => {
      const angle = ((index * segmentAngle - segmentAngle / 2 - 90) * Math.PI) / 180;
      const x1 = CENTER + OUTER_BULL * Math.cos(angle);
      const y1 = CENTER + OUTER_BULL * Math.sin(angle);
      const x2 = CENTER + DOUBLE_OUTER * Math.cos(angle);
      const y2 = CENTER + DOUBLE_OUTER * Math.sin(angle);

      lines.push(
        <line
          key={`wire-radial-${index}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={wireColor}
          strokeWidth={strokeWidth}
        />
      );
    });

    // Circular wires
    const rings = [OUTER_BULL, TRIPLE_INNER, TRIPLE_OUTER, DOUBLE_INNER, DOUBLE_OUTER];
    rings.forEach((radius, index) => {
      lines.push(
        <circle
          key={`wire-circle-${index}`}
          cx={CENTER}
          cy={CENTER}
          r={radius}
          fill="none"
          stroke={wireColor}
          strokeWidth={strokeWidth}
        />
      );
    });

    return lines;
  }, [colors.wire, wireStyle.width]);

  // Number labels
  const numberLabels = useMemo(() => {
    const labels: React.ReactNode[] = [];
    const segmentAngle = 360 / 20;
    const labelRadius = NUMBER_RADIUS; // Position outside the frame ring

    SEGMENTS.forEach((value, index) => {
      const angle = ((index * segmentAngle - 90) * Math.PI) / 180;
      const x = CENTER + labelRadius * Math.cos(angle);
      const y = CENTER + labelRadius * Math.sin(angle);

      labels.push(
        <text
          key={`number-${index}`}
          x={x}
          y={y}
          fill={colors.numbers}
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontFamily: "'Oswald', sans-serif" }}
        >
          {value}
        </text>
      );
    });

    return labels;
  }, [colors.numbers]);

  // Handle mouse/touch events
  const handleEvent = useCallback(
    (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      if (disabled) return;

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();

      let clientX: number, clientY: number;

      if ('touches' in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      // Convert to SVG coordinates
      const x = ((clientX - rect.left) / rect.width) * BOARD_SIZE;
      const y = ((clientY - rect.top) / rect.height) * BOARD_SIZE;

      return { x, y };
    },
    [disabled]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pos = handleEvent(e);
      if (pos && onBoardClick) {
        onBoardClick(pos.x, pos.y);
      }
    },
    [handleEvent, onBoardClick]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pos = handleEvent(e);
      if (pos && onBoardMove) {
        onBoardMove(pos.x, pos.y);
      }
    },
    [handleEvent, onBoardMove]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      e.preventDefault(); // Prevent scrolling while aiming
      const pos = handleEvent(e);
      if (pos && onBoardMove) {
        onBoardMove(pos.x, pos.y);
      }
    },
    [handleEvent, onBoardMove]
  );

  return (
    <svg
      viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
      className={`dartboard ${className}`}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={onBoardLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={onBoardLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onContextMenu={onContextMenu}
      style={{
        width: '100%',
        maxWidth: '500px',
        cursor: disabled ? 'default' : 'crosshair',
        touchAction: 'none',
      }}
    >
      {/* Background */}
      <rect
        x="0"
        y="0"
        width={BOARD_SIZE}
        height={BOARD_SIZE}
        fill={colors.background}
      />

      {/* Segments */}
      {segments}

      {/* Outer bull (25 ring) */}
      <circle cx={CENTER} cy={CENTER} r={OUTER_BULL} fill={colors.bullOuter} />

      {/* Inner bull (50) */}
      <circle cx={CENTER} cy={CENTER} r={INNER_BULL} fill={colors.bullInner} />

      {/* Wire overlay */}
      <g
        style={{
          filter: wireStyle.glow
            ? `drop-shadow(0 0 ${wireStyle.glowIntensity || 5}px ${wireStyle.glowColor || colors.wire})`
            : undefined,
        }}
      >
        {wireLines}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={INNER_BULL}
          fill="none"
          stroke={colors.wire}
          strokeWidth={wireStyle.width}
        />
      </g>

      {/* Blue frame ring */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={(FRAME_INNER + FRAME_OUTER) / 2}
        fill="none"
        stroke={colors.frame}
        strokeWidth={FRAME_OUTER - FRAME_INNER}
      />

      {/* Number labels */}
      {numberLabels}

      {/* Aim cursor (with wobble offset applied) */}
      {showAimCursor && aimPosition && (
        <g>
          <circle
            cx={aimPosition.x + aimWobble.x}
            cy={aimPosition.y + aimWobble.y}
            r={8}
            fill="none"
            stroke="rgba(255, 255, 255, 0.8)"
            strokeWidth="2"
          />
          <circle
            cx={aimPosition.x + aimWobble.x}
            cy={aimPosition.y + aimWobble.y}
            r={2}
            fill="rgba(255, 255, 255, 0.9)"
          />
        </g>
      )}

      {/* Thrown darts */}
      {dartPositions.map((dart) => (
        <g key={dart.id}>
          {/* Dart shadow */}
          <circle
            cx={dart.x + 2}
            cy={dart.y + 2}
            r={6}
            fill="rgba(0, 0, 0, 0.3)"
          />
          {/* Dart point */}
          <circle
            cx={dart.x}
            cy={dart.y}
            r={5}
            fill="#ff4444"
            stroke="#cc0000"
            strokeWidth="1"
          />
          <circle cx={dart.x} cy={dart.y} r={2} fill="#ffcc00" />
        </g>
      ))}
    </svg>
  );
};

export default Dartboard;
