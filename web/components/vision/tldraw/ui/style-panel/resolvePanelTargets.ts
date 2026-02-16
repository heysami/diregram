'use client';

import type { Editor } from 'tldraw';

function uniqById(shapes: any[]): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const s of Array.isArray(shapes) ? shapes : []) {
    const id = String(s?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(s);
  }
  return out;
}

function isBooleanBundleGroup(s: any): boolean {
  return Boolean(s && typeof s === 'object' && s.type === 'group' && s?.meta?.nxBooleanBundle?.resultId);
}

function getBooleanBundleResultId(s: any): string | null {
  const rid = s?.meta?.nxBooleanBundle?.resultId;
  return typeof rid === 'string' && rid ? String(rid) : null;
}

export function isNxFxProxy(s: any): boolean {
  return Boolean(s && typeof s === 'object' && s.type === 'nxfx');
}

export function getProxySourceId(s: any): string | null {
  const sid = s?.meta?.nxFxProxy?.sourceId;
  return typeof sid === 'string' && sid ? sid : null;
}

/**
 * Resolve the shapes that the style panel should *edit*.
 *
 * Key invariants:
 * - If a boolean bundle group is selected, edit the boolean result shape (keep selection as group for move/ungroup UX).
 * - If an FX proxy is selected, edit the underlying source shape.
 */
export function resolveStylePanelTargets(editor: Editor, selectedShapes: any[]): any[] {
  const base = (Array.isArray(selectedShapes) ? selectedShapes : [])
    .map((s) => {
      if (isBooleanBundleGroup(s)) {
        const rid = getBooleanBundleResultId(s);
        if (!rid) return s;
        try {
          return (editor as any).getShape?.(rid as any) || s;
        } catch {
          return s;
        }
      }
      return s;
    })
    .filter(Boolean);

  const afterFx = base
    .map((s) => {
      if (!isNxFxProxy(s)) return s;
      const sid = getProxySourceId(s);
      if (!sid) return s;
      try {
        return (editor as any).getShape?.(sid as any) || s;
      } catch {
        return s;
      }
    })
    .filter(Boolean);

  return uniqById(afterFx);
}

