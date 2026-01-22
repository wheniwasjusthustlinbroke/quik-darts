import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export const TrophyIcon: React.FC<IconProps> = ({
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
      d="M8 21H16M12 17V21M6 4H18V8C18 11.3137 15.3137 14 12 14C8.68629 14 6 11.3137 6 8V4Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 4H4V6C4 7.10457 4.89543 8 6 8V4ZM18 4V8C19.1046 8 20 7.10457 20 6V4H18Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default TrophyIcon;
