import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export const PlayIcon: React.FC<IconProps> = ({
  size = 20,
  color = 'currentColor',
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    aria-hidden="true"
    className={className}
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

export default PlayIcon;
