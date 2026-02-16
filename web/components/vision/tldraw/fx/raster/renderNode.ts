'use client';

import type { Editor } from 'tldraw';
import { Box } from '@tldraw/editor';
import { readNxFxFromMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import type { AnyCanvas } from '@/components/vision/tldraw/fx/raster/canvasUtil';
import { createCanvas, get2d } from '@/components/vision/tldraw/fx/raster/canvasUtil';
import { applyNxFxStack, canvasToPngObjectUrl, downscaleIfNeeded, scaleNxFxForRaster } from '@/components/vision/tldraw/fx/raster/applyStack';
import { computeFxMarginPx } from '@/components/vision/tldraw/fx/raster/fxMargin';

export type PageBounds = { x: number; y: number; w: number; h: number };

function asBox(b: any): PageBounds | null {
  if (!b) return null;
  const x = Number(b.x ?? b.minX ?? 0);
  const y = Number(b.y ?? b.minY ?? 0);
  const w = Number(b.w ?? b.width ?? 0);
  const h = Number(b.h ?? b.height ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function isGroupLike(shape: any): boolean {
  return shape?.type === 'group' || shape?.type === 'frame';
}

function isProxy(shape: any): boolean {
  return shape?.type === 'nxfx';
}

function sanitizeSvgForRaster(svg: string): {
  svg: string;
  changed: boolean;
  flags: { hasHttp: boolean; hasImage: boolean; hasStyle: boolean; hasForeignObject: boolean };
} {
  const s = String(svg || '');
  // NOTE: `http://www.w3.org/...` XML namespaces are expected and do NOT taint. We only care about
  // external resource URLs and HTML embedding.
  const hasHttp = /url\(\s*['"]?\s*https?:\/\//i.test(s) || /\b(?:href|xlink:href)\s*=\s*["']https?:\/\//i.test(s);
  const hasImage = /<image[\s>]/i.test(s) || /href\s*=\s*["']https?:\/\//i.test(s);
  const hasStyle = /<style[\s>]/i.test(s) || /@import/i.test(s);
  const hasForeignObject = /<foreignObject[\s>]/i.test(s);
  let out = s;
  // Remove style blocks (can include @import / url() that taints).
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove all foreignObject blocks. These can embed HTML / external resources and will taint canvas exports.
  out = out.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  // Remove external images (keep data: images).
  out = out.replace(/<image\b[^>]*?\bhref\s*=\s*["']https?:\/\/[^"']*["'][^>]*?>/gi, '');
  out = out.replace(/<image\b[^>]*?\bxlink:href\s*=\s*["']https?:\/\/[^"']*["'][^>]*?>/gi, '');
  // Remove any remaining url(http...) patterns.
  out = out.replace(/url\(\s*['"]?\s*https?:\/\/[^'")]+['"]?\s*\)/gi, 'none');
  const changed = out !== s;
  return { svg: out, changed, flags: { hasHttp, hasImage, hasStyle, hasForeignObject } };
}

async function rasterizeLeaf(editor: Editor, id: string, bounds: PageBounds, pixelRatio: number): Promise<AnyCanvas | null> {
  const pw = Math.max(1, Math.round(bounds.w * pixelRatio));
  const ph = Math.max(1, Math.round(bounds.h * pixelRatio));
  const exportBounds = new Box(bounds.x, bounds.y, bounds.w, bounds.h);

  // Prefer SVG export → bitmap: this works reliably for custom shapes and avoids cases where
  // `toImage()` returns no blob (leaving the proxy stuck on "Rendering effects…").
  try {
    const r: any = await (editor as any).getSvgString?.([id], { padding: 0, background: false, bounds: exportBounds, pixelRatio });
    const rawSvg = r?.svg ? String(r.svg) : '';
    const san = sanitizeSvgForRaster(rawSvg);
    const svg = san.svg;
    if (svg) {
      // Use <img>.decode() instead of createImageBitmap(svgBlob): this is more reliable across browsers.
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      try {
        if (typeof img.decode === 'function') await img.decode();
        else {
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('img load failed'));
          });
        }
      } finally {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      const c = createCanvas(pw, ph);
      const ctx = get2d(c);
      ctx.clearRect(0, 0, pw, ph);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img as any, 0, 0, pw, ph);
      // Quick sanity: is the raster non-empty?
      let nonZeroAlpha = -1;
      try {
        const data = ctx.getImageData(0, 0, pw, ph).data;
        let samples = 0;
        nonZeroAlpha = 0;
        for (let y = 0; y < ph; y += Math.max(1, Math.floor(ph / 20))) {
          for (let x = 0; x < pw; x += Math.max(1, Math.floor(pw / 20))) {
            const i = (y * pw + x) * 4 + 3;
            samples++;
            if (data[i] > 0) nonZeroAlpha++;
          }
        }
      } catch {
        // ignore
      }
      // If the decoded SVG appears fully transparent, fall back to `editor.toImage` which can
      // rasterize using the editor’s internal renderer (and avoids foreignObject stripping issues).
      if (nonZeroAlpha > 0 || nonZeroAlpha === -1) return c;
    }
  } catch {
    // fall through
  }

  try {
    const img: any = await (editor as any).toImage([id], {
      format: 'png',
      background: false,
      padding: 0,
      pixelRatio,
      scale: 1,
      bounds: exportBounds,
    });
    const blob: Blob | null = img?.blob || null;
    if (!blob) return null;
    const bmp = await createImageBitmap(blob);
    const c = createCanvas(pw, ph);
    const ctx = get2d(c);
    ctx.clearRect(0, 0, pw, ph);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp as any, 0, 0, pw, ph);
    try {
      bmp.close?.();
    } catch {
      // ignore
    }
    return c;
  } catch {
    return null;
  }
}

function getBounds(editor: Editor, id: string): PageBounds | null {
  const a = asBox((editor as any).getShapePageBounds?.(id as any));
  if (a) return a;
  // Fallback: some tldraw internals may return null for hidden shapes; shapesPageBounds is often more robust.
  const b = asBox((editor as any).getShapesPageBounds?.([id] as any));
  if (b) return b;
  const c = asBox((editor as any).getSelectionPageBounds?.());
  // Only use selection bounds if it obviously corresponds to this single id (best-effort)
  return c;
}

async function renderNodeInner(
  editor: Editor,
  id: string,
  pixelRatio: number,
  state: { remaining: number },
): Promise<{ canvas: AnyCanvas; bounds: PageBounds } | null> {
  state.remaining -= 1;
  if (state.remaining <= 0) return null;
  const shape: any = (editor as any).getShape?.(id as any);
  if (!shape || isProxy(shape)) return null;
  const baseBounds = getBounds(editor, id);
  const bounds = baseBounds;
  if (!bounds) return null;

  const fxRaw = readNxFxFromMeta(shape.meta);
  const fx = scaleNxFxForRaster(fxRaw, pixelRatio);

  // Expand bounds to avoid clipping effects like drop shadows.
  const marginPx = computeFxMarginPx(fx);

  const expandedBounds: PageBounds = {
    x: baseBounds.x - marginPx.l / pixelRatio,
    y: baseBounds.y - marginPx.t / pixelRatio,
    w: baseBounds.w + (marginPx.l + marginPx.r) / pixelRatio,
    h: baseBounds.h + (marginPx.t + marginPx.b) / pixelRatio,
  };

  // If group-like, composite children in draw order.
  if (isGroupLike(shape)) {
    let childIds: string[] = [];
    try {
      childIds = ((editor as any).getSortedChildIdsForParent?.(id as any) || []).map(String);
    } catch {
      childIds = [];
    }
    // Safety: very large groups can be extremely expensive to rasterize per-child.
    // Fallback: export the group as a single image and apply only the group stack.
    if (childIds.length > 180) {
      const leaf = await rasterizeLeaf(editor, id, expandedBounds, pixelRatio);
      if (!leaf) return null;
      const out = await applyNxFxStack(leaf, fx);
      return { canvas: out, bounds: expandedBounds };
    }
    // If no children, treat as leaf.
    if (!childIds.length) {
      const leaf = await rasterizeLeaf(editor, id, expandedBounds, pixelRatio);
      if (!leaf) return null;
      const out = await applyNxFxStack(leaf, fx);
      return { canvas: out, bounds: expandedBounds };
    }

    const pw = Math.max(1, Math.round(expandedBounds.w * pixelRatio));
    const ph = Math.max(1, Math.round(expandedBounds.h * pixelRatio));
    const c = createCanvas(pw, ph);
    const ctx = get2d(c);
    ctx.clearRect(0, 0, pw, ph);

    for (const childId of childIds) {
      const childRes = await renderNodeInner(editor, childId, pixelRatio, state);
      if (!childRes) continue;
      const cb = childRes.bounds;
      const dx = Math.round((cb.x - expandedBounds.x) * pixelRatio);
      const dy = Math.round((cb.y - expandedBounds.y) * pixelRatio);
      try {
        ctx.drawImage(childRes.canvas as any, dx, dy);
      } catch {
        // ignore
      }
    }

    const out = await applyNxFxStack(c, fx);
    return { canvas: out, bounds: expandedBounds };
  }

  // Leaf
  const leaf = await rasterizeLeaf(editor, id, expandedBounds, pixelRatio);
  if (!leaf) return null;
  const out = await applyNxFxStack(leaf, fx);
  return { canvas: out, bounds: expandedBounds };
}

export async function renderNodeToPngUrl(
  editor: Editor,
  rootId: string,
  opts: { pixelRatio: number; maxDim?: number },
): Promise<{ url: string; blob: Blob; pixelWidth: number; pixelHeight: number; bounds: PageBounds } | null> {
  const pixelRatio = Math.max(0.25, Math.min(4, Number(opts.pixelRatio || 1)));
  try {
    const res = await renderNodeInner(editor, String(rootId), pixelRatio, { remaining: 520 });
    if (!res) return null;
    const capped = await downscaleIfNeeded(res.canvas, opts.maxDim || 1400);
    const blobRes = await canvasToPngObjectUrl(capped);
    const pixelWidth = Number((capped as any).width || 1);
    const pixelHeight = Number((capped as any).height || 1);
    return { url: blobRes.url, blob: blobRes.blob, pixelWidth, pixelHeight, bounds: res.bounds };
  } catch (e: any) {
    return null;
  }
}

