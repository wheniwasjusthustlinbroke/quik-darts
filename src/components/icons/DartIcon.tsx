import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export const DartIcon: React.FC<IconProps> = ({
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
    <path
      d="M22 2L13 11M22 2L18 22L13 11M22 2L2 7L13 11"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default DartIcon;
