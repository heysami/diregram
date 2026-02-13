export type LayoutDirection = 'horizontal' | 'vertical';

export function normalizeLayoutDirection(v: unknown): LayoutDirection {
  return v === 'vertical' ? 'vertical' : 'horizontal';
}

