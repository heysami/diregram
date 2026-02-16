'use client';

import { toHex8OrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';

export type GradientStop = { offset: number; color: string };

export function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeStops(stops: GradientStop[]) {
  const next = (Array.isArray(stops) ? stops : [])
    .map((s) => ({ offset: clamp01(Number((s as any)?.offset)), color: toHex8OrEmpty(String((s as any)?.color)) || '#000000ff' }))
    .sort((a, b) => a.offset - b.offset);
  if (next.length === 0) return [{ offset: 0, color: '#000000ff' }, { offset: 1, color: '#ffffffff' }];
  if (next.length === 1) return [next[0], { offset: 1, color: next[0].color }];
  return next;
}

export function parseStopsJson(json: any, fallbackA: string, fallbackB: string): GradientStop[] {
  try {
    const raw = typeof json === 'string' ? JSON.parse(json) : null;
    const arr: any[] = Array.isArray(raw) ? raw : [];
    const stops = arr
      .map((s) => ({ offset: clamp01(Number(s?.offset ?? 0)), color: toHex8OrEmpty(String(s?.color || '')) || '' }))
      .filter((s) => !!s.color)
      .sort((a, b) => a.offset - b.offset);
    if (stops.length >= 2) return stops as GradientStop[];
  } catch {
    // ignore
  }
  return [
    { offset: 0, color: toHex8OrEmpty(fallbackA) || '#000000ff' },
    { offset: 1, color: toHex8OrEmpty(fallbackB) || '#ffffffff' },
  ];
}

export function serializeStops(stops: GradientStop[]) {
  return JSON.stringify(normalizeStops(stops));
}

