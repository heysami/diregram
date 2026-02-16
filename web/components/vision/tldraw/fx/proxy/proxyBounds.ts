import type { Editor, TLShapeId } from 'tldraw';
import { readNxFxFromMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import { scaleNxFxForRaster } from '@/components/vision/tldraw/fx/raster/applyStack';
import { computeFxMarginPx } from '@/components/vision/tldraw/fx/raster/fxMargin';

export type PageBounds = { x: number; y: number; w: number; h: number };

export function getParentSpacePoint(
  editor: Editor,
  shapeId: TLShapeId,
  pagePoint: { x: number; y: number },
): { x: number; y: number } {
  try {
    const p = (editor as any).getPointInParentSpace?.(shapeId as any, pagePoint);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: Number(p.x), y: Number(p.y) };
  } catch {
    // ignore
  }
  return { x: pagePoint.x, y: pagePoint.y };
}

export function getShapePageBounds(editor: Editor, id: TLShapeId): PageBounds | null {
  try {
    const b: any = (editor as any).getShapePageBounds?.(id as any);
    if (!b) return null;
    const x = Number(b.x ?? b.minX ?? 0);
    const y = Number(b.y ?? b.minY ?? 0);
    const w = Number(b.w ?? b.width ?? 0);
    const h = Number(b.h ?? b.height ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  } catch {
    return null;
  }
}

export function computeExpandedBoundsForFx(editor: Editor, sourceShape: any, b: PageBounds, pixelRatio: number): PageBounds {
  const fxRaw = readNxFxFromMeta(sourceShape?.meta);
  const fxScaled = scaleNxFxForRaster(fxRaw, pixelRatio);
  const marginPx = computeFxMarginPx(fxScaled);
  const pr = Math.max(0.25, Math.min(4, Number(pixelRatio || 1)));
  return {
    x: b.x - marginPx.l / pr,
    y: b.y - marginPx.t / pr,
    w: b.w + (marginPx.l + marginPx.r) / pr,
    h: b.h + (marginPx.t + marginPx.b) / pr,
  };
}

