'use client';

import type { Editor } from 'tldraw';
import { readNxFxFromMeta, isNxFxEmpty } from '@/components/vision/tldraw/fx/nxfxTypes';

function maskSourceSupportedForVector(editor: Editor, sourceId: string): boolean {
  if (!sourceId) return false;
  try {
    const s: any = editor.getShape(sourceId as any);
    if (!s) return false;
    // Only Vision vector shapes have stable geometry we can reuse for vector masks.
    const t = String(s.type || '');
    return t === 'nxrect' || t === 'nxpath';
  } catch {
    return false;
  }
}

/**
 * Whether a shape's fx stack requires a raster proxy (`nxfx`) to render correctly.
 * If false, the vector shape renders normally and can optionally apply a vector mask (shape-mode).
 */
export function requiresFxProxy(editor: Editor, shape: any): boolean {
  const fx = readNxFxFromMeta(shape?.meta);
  if (isNxFxEmpty(fx)) return false;
  const effects = Array.isArray((fx as any)?.effects) ? (fx as any).effects : [];
  if (effects.length) return true;
  const ds = Array.isArray((fx as any)?.distortions) ? (fx as any).distortions : [];
  // Any non-mask distortion requires proxy.
  if (ds.some((d: any) => d && d.kind !== 'mask')) return true;
  const masks = ds.filter((d: any) => d && d.kind === 'mask' && d.enabled !== false);
  if (!masks.length) return false;
  // Alpha-mode mask requires proxy (needs rendered alpha).
  if (masks.some((m: any) => String(m.mode || 'alpha') !== 'shape')) return true;
  // Shape-mode-only: use vector mask when possible.
  const isGroupLikeShape = shape?.type === 'group' || shape?.type === 'frame' || shape?.type === 'nxlayout';
  if (isGroupLikeShape) return true; // group masking not implemented as vector
  // If any mask source is unsupported, fall back to proxy so mask still works.
  if (masks.some((m: any) => !maskSourceSupportedForVector(editor, String(m.sourceId || '')))) return true;
  return false;
}

