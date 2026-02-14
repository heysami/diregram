import type React from 'react';

export function selectedMonochromeBoxShadow(): string {
  // Black ring + white inner ring for contrast on dark headers.
  return 'inset 0 0 0 2px rgba(0,0,0,0.95), inset 0 0 0 4px rgba(255,255,255,0.9)';
}

export function activeCellOutlineStyle(isActive: boolean): React.CSSProperties {
  return isActive ? { outline: '2px solid #0f172a', outlineOffset: '-2px' } : {};
}

export function selectedCellStyle(opts: { isSelected: boolean; isActive: boolean }): React.CSSProperties {
  const { isSelected, isActive } = opts;
  return {
    ...(isSelected ? { boxShadow: selectedMonochromeBoxShadow() } : {}),
    ...activeCellOutlineStyle(isActive),
  };
}

export function stickyInnerCellStyle(opts: {
  isSelected: boolean;
  isActive: boolean;
  baseBg?: string;
  baseColor?: string;
}): React.CSSProperties {
  const { isSelected, isActive, baseBg, baseColor } = opts;
  return {
    backgroundColor: baseBg ?? '#fff',
    ...(baseColor ? { color: baseColor } : {}),
    boxShadow: isSelected
      ? `${selectedMonochromeBoxShadow()}, 0 0 0 1px rgba(15, 23, 42, 0.06)`
      : '0 0 0 1px rgba(15, 23, 42, 0.06)',
    ...activeCellOutlineStyle(isActive),
  };
}

