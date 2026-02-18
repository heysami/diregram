'use client';

import type { Editor } from 'tldraw';
import { type TLShapeId } from '@tldraw/tlschema';

export function asNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function isNxLayout(shape: any): boolean {
  return Boolean(shape && typeof shape === 'object' && String(shape.type || '') === 'nxlayout');
}

export function getParentShapeId(parentId: any): TLShapeId | null {
  const s = String(parentId || '');
  // tldraw usually stores parent ids as `shape:xxxx` or `page:xxxx`, but we also
  // tolerate raw/unprefixed ids to avoid missing dirtying/layout refresh in edge cases.
  if (!s) return null;
  if (s.startsWith('page:')) return null;
  if (s.startsWith('shape:')) return s.slice('shape:'.length) as TLShapeId;
  return s as TLShapeId;
}

export function getChildIds(editor: Editor, parentId: TLShapeId): TLShapeId[] {
  try {
    return ((editor as any).getSortedChildIdsForParent?.(parentId as any) || []).filter(Boolean);
  } catch {
    return [];
  }
}

export function safeGetShape(editor: Editor, id: TLShapeId): any | null {
  const raw = String(id || '');
  const candidates = raw
    ? raw.startsWith('shape:')
      ? [raw, raw.slice('shape:'.length)]
      : [raw, `shape:${raw}`]
    : [];
  for (const cand of candidates) {
    try {
      const s = (editor as any).getShape?.(cand as any) || null;
      if (s) return s;
    } catch {
      // ignore
    }
  }
  return null;
}

