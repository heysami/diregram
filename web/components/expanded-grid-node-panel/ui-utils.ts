'use client';

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeItems<T extends { id: string }>(items: unknown): T[] {
  if (!Array.isArray(items)) return [];
  return (items as unknown[])
    .filter((x): x is T => !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).id === 'string');
}

