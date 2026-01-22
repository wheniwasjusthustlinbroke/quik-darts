import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export const MenuIcon: React.FC<IconProps> = ({
  size = 24,
  color = 'currentColor',
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className={className}
  >
    <path
      d="M3 12H21M3 6H21M3 18H21"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export default MenuIcon;
