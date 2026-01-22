import React from 'react';

interface CoinIconProps {
  size?: number;
  className?: string;
}

export const CoinIcon: React.FC<CoinIconProps> = ({ size = 16, className }) => (
  <img
    src="/assets/coin-chip.png"
    alt=""
    aria-hidden="true"
    width={size}
    height={size}
    className={className}
    style={{ objectFit: 'contain' }}
    decoding="async"
  />
);

export default CoinIcon;
