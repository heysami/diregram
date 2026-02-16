'use client';

import type { Editor } from 'tldraw';
import { defaultColorNames, getDefaultColorTheme } from '@tldraw/tlschema';

export function clamp01(v: number) {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

export function toHexOrEmpty(v: string) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return s.toLowerCase();
  return '';
}

export function toHex8OrEmpty(v: string) {
  const s = toHexOrEmpty(v);
  if (!s) return '';
  if (s.length === 7) return `${s}ff`;
  return s;
}

export function hex8ToRgbaCss(v: string) {
  const s = toHex8OrEmpty(v);
  if (!s) return String(v || '');
  const r = parseInt(s.slice(1, 3), 16);
  const g = parseInt(s.slice(3, 5), 16);
  const b = parseInt(s.slice(5, 7), 16);
  const a = parseInt(s.slice(7, 9), 16) / 255;
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`;
}

export function cssVarToHex(varName: string): string | null {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName)?.trim();
    if (!raw) return null;
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    const m = raw.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const parts = m[1].split(',').map((x) => x.trim());
    const r = Math.max(0, Math.min(255, Number(parts[0] || 0)));
    const g = Math.max(0, Math.min(255, Number(parts[1] || 0)));
    const b = Math.max(0, Math.min(255, Number(parts[2] || 0)));
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}

export function getTldrawTokenHex(token: string): string | null {
  const k = String(token || '').trim();
  if (!k) return null;
  return cssVarToHex(`--tl-color-${k}`) || cssVarToHex(`--color-${k}`) || null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const s = toHexOrEmpty(hex);
  if (!s) return null;
  const rgb = s.length === 9 ? s.slice(0, 7) : s;
  const r = parseInt(rgb.slice(1, 3), 16);
  const g = parseInt(rgb.slice(3, 5), 16);
  const b = parseInt(rgb.slice(5, 7), 16);
  return { r, g, b };
}

export function rgbDist2(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export function getIsDarkMode(editor: Editor): boolean {
  try {
    const fn = (editor as any)?.user?.getIsDarkMode;
    if (typeof fn === 'function') return Boolean(fn.call((editor as any).user));
  } catch {
    // ignore
  }
  try {
    return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  } catch {
    return false;
  }
}

export type FillVariant = 'fill' | 'semi' | 'pattern';
export function getFillVariant(fillStyle: string): FillVariant {
  return fillStyle === 'semi' ? 'semi' : fillStyle === 'pattern' ? 'pattern' : 'fill';
}

export function getVariantHex(theme: any, token: string, variant: 'fill' | 'semi' | 'pattern' | 'solid'): string | null {
  const t = String(token || '').trim();
  if (!t) return null;
  const entry = theme?.[t];
  const v = entry?.[variant];
  return typeof v === 'string' ? v : null;
}

export function makeTheme(editor: Editor) {
  return getDefaultColorTheme({ isDarkMode: getIsDarkMode(editor) }) as any;
}

export function nearestTokenForHex(opts: {
  theme: any;
  hex: string;
  variant: 'fill' | 'semi' | 'pattern' | 'solid';
}): string | null {
  const rgb = hexToRgb(opts.hex);
  if (!rgb) return null;
  let best: { token: string; d2: number } | null = null;
  for (const token of defaultColorNames as unknown as string[]) {
    const vHex = getVariantHex(opts.theme, token, opts.variant) || getTldrawTokenHex(token);
    const vRgb = vHex ? hexToRgb(vHex) : null;
    if (!vRgb) continue;
    const d2 = rgbDist2(rgb, vRgb);
    if (!best || d2 < best.d2) best = { token, d2 };
  }
  return best?.token || null;
}

