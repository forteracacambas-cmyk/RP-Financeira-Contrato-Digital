import React from 'react';

interface BrandLogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  showWordmark = true,
  size = 'md',
}) => {
  const iconDims = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        viewBox="0 0 64 54"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDims} shrink-0`}
        aria-hidden="true"
      >
        {/* Black R leg & stem */}
        <path
          d="M6 46V8H24C32 8 36 12.5 36 19.5C36 25.5 32.5 29.5 26 31L36 46H26.5L17.5 31.8H14V46H6ZM14 24.5H23C26.5 24.5 28 22.8 28 19.5C28 16.2 26.5 14.5 23 14.5H14V24.5Z"
          fill="#18181B"
        />
        {/* Crimson P overlapping */}
        <path
          d="M25 46V8H44C52.5 8 58 13.2 58 21C58 28.8 52.5 34 44 34H33V46H25ZM33 26.8H43C47.5 26.8 50 24.5 50 21C50 17.5 47.5 15.2 43 15.2H33V26.8Z"
          fill="#A51C20"
        />
      </svg>
      {showWordmark && (
        <span className={`${textSize} font-extrabold tracking-tight text-zinc-900`}>
          RP <span className="text-[#A51C20]">FINANCEIRA</span>
        </span>
      )}
    </span>
  );
};
