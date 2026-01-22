import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export const GlobeIcon: React.FC<IconProps> = ({
  size = 20,
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
    <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
    <path
      d="M2 12H22M12 2C14.5 4.5 16 8 16 12C16 16 14.5 19.5 12 22C9.5 19.5 8 16 8 12C8 8 9.5 4.5 12 2Z"
      stroke={color}
      strokeWidth="2"
    />
  </svg>
);

export default GlobeIcon;
