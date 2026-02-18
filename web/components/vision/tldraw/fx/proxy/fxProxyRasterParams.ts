'use client';

import type { Editor } from 'tldraw';
import { readNxFxFromMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import { getShapePageBounds } from '@/components/vision/tldraw/fx/proxy/proxyBounds';

export function computeFxRasterParams(editor: Editor, sourceId: string): { maxDim: number; pixelRatio: number } {
  const maxDim = 2400;
  let pixelRatio = 2;
  try {
    const b = getShapePageBounds(editor, sourceId as any);
    if (b) {
      const m = Math.max(1, Math.max(b.w, b.h));
      pixelRatio = Math.max(0.5, Math.min(3, maxDim / m));
    }
  } catch {
    pixelRatio = 2;
  }

  // Performance: masking requires an additional raster pass (mask source export).
  // When the stack is *only* a mask (no blur/shadow/etc), we can render at a lower DPR
  // without a noticeable quality hit in most cases.
  try {
    const s: any = editor.getShape(sourceId as any);
    const fx = s ? readNxFxFromMeta(s.meta) : null;
    const effects = Array.isArray((fx as any)?.effects) ? (fx as any).effects : [];
    const distortions = Array.isArray((fx as any)?.distortions) ? (fx as any).distortions : [];
    const maskOnly =
      effects.length === 0 &&
      distortions.length > 0 &&
      distortions.every((d: any) => d && d.kind === 'mask');
    if (maskOnly) pixelRatio = Math.min(pixelRatio, 1);
  } catch {
    // ignore
  }

  return { maxDim, pixelRatio };
}

