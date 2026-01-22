import React from 'react';

interface StakeChipIconProps {
  size?: number;
  className?: string;
}

export const StakeChipIcon: React.FC<StakeChipIconProps> = ({
  size = 86,
  className = '',
}) => (
  <img
    className={className}
    src="/assets/chip-stack.png"
    alt=""
    aria-hidden="true"
    width={size}
    height={size}
    draggable={false}
    style={{
      display: 'block',
      userSelect: 'none',
      objectFit: 'contain',
      filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
      mixBlendMode: 'lighten',
    }}
  />
);

export default StakeChipIcon;
