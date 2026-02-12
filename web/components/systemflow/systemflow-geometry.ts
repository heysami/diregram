import type { SystemFlowSide } from '@/lib/system-flow-storage';

export const CELL_PX = 32;
export const GAP_PX = 2;

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function snapPx(v: number): number {
  const step = CELL_PX + GAP_PX;
  return Math.round(v / step) * step;
}

export function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function autoSide(from: { cx: number; cy: number }, to: { cx: number; cy: number }): SystemFlowSide {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

export function oppositeSide(s: SystemFlowSide): SystemFlowSide {
  if (s === 'left') return 'right';
  if (s === 'right') return 'left';
  if (s === 'top') return 'bottom';
  return 'top';
}

export function measureLabel(label: string): { w: number; h: number } {
  // Approximation (keeps label tight without needing DOM measurement).
  const padX = 6;
  const h = 18;
  const perChar = 6.2;
  const w = clamp(Math.round(label.length * perChar + padX * 2), 24, 220);
  return { w, h };
}

