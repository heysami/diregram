import type { ComponentProps } from 'react';

type Props = {
  size?: number;
} & Omit<ComponentProps<'svg'>, 'width' | 'height'>;

/**
 * Simple inline brand mark (D + plus) inspired by the provided reference.
 * Uses `currentColor` so it inherits surrounding text color.
 */
export function DiregramMark({ size = 14, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* D shape (outer - inner) */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="
          M18 12
          H58
          A42 52 0 0 1 58 116
          H18
          Z

          M36 30
          H56
          A26 34 0 0 1 56 98
          H36
          Z
        "
      />

      {/* Plus */}
      <path
        fill="currentColor"
        stroke="#ffffff"
        strokeWidth={14}
        strokeLinejoin="miter"
        paintOrder="stroke fill"
        d="
          M76 74
          H94
          V92
          H112
          V110
          H94
          V128
          H76
          V110
          H58
          V92
          H76
          Z
        "
        transform="translate(0 -14)"
      />
    </svg>
  );
}

