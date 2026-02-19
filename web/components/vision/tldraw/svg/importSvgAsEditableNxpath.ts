'use client';

import { createShapeId } from '@tldraw/tlschema';
import { computeSvgPathsBBox, extractPathDFromSvg, readSvgViewBox } from '@/components/vision/tldraw/autoconvert';

type ViewportBounds = {
  x?: number;
  y?: number;
  minX?: number;
  minY?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
};

type EditorLike = {
  getSelectedShapeIds?: () => unknown[];
  getShape?: (id: unknown) => { type?: unknown } | null | undefined;
  deleteShapes?: (ids: unknown[]) => void;
  setSelectedShapes?: (ids: unknown[]) => void;
  createShape?: (shape: unknown) => void;
  putExternalContent?: (content: unknown) => void;
  getViewportPageBounds?: () => ViewportBounds | null | undefined;
};

export function extractBasicPaintFromSvg(svgText: string): { fill: string | null; stroke: string | null; strokeWidth: number | null } {
  try {
    const svg = String(svgText || '').trim();
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const p = doc.querySelector('path');
    const fillAttr = String(p?.getAttribute('fill') || '').trim();
    const strokeAttr = String(p?.getAttribute('stroke') || '').trim();
    const swAttr = String(p?.getAttribute('stroke-width') || '').trim();
    const toHex8 = (s: string): string | null => {
      const v = String(s || '').trim();
      if (!v || v === 'none') return null;
      if (!v.startsWith('#')) return null;
      const hex = v.slice(1);
      if (hex.length === 3) {
        const r = hex[0];
        const g = hex[1];
        const b = hex[2];
        return `#${r}${r}${g}${g}${b}${b}ff`;
      }
      if (hex.length === 6) return `#${hex}ff`;
      if (hex.length === 8) return `#${hex}`;
      return null;
    };
    const fill = toHex8(fillAttr);
    const stroke = toHex8(strokeAttr);
    const strokeWidth = Number(swAttr);
    return {
      fill: fill || null,
      stroke: stroke || null,
      strokeWidth: Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : null,
    };
  } catch {
    return { fill: null, stroke: null, strokeWidth: null };
  }
}

export function computeViewportCenteredPastePoint(editor: EditorLike, w: number, h: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  try {
    const b = editor?.getViewportPageBounds?.() || null;
    const bx = Number(b?.x ?? b?.minX ?? 0);
    const by = Number(b?.y ?? b?.minY ?? 0);
    const bw = Number(b?.w ?? b?.width ?? 0);
    const bh = Number(b?.h ?? b?.height ?? 0);
    if (Number.isFinite(bx) && Number.isFinite(by) && Number.isFinite(bw) && Number.isFinite(bh)) {
      x = bx + bw / 2 - w / 2;
      y = by + bh / 2 - h / 2;
    }
  } catch {
    // ignore
  }
  return { x, y };
}

export function importSvgAsEditableNxpath(editor: unknown, svgText: string, opts?: { nxName?: string }): boolean {
  const ed = editor as EditorLike | null;
  if (!ed) return false;
  const svg = String(svgText || '').trim();
  if (!svg) return false;

  const nxName = String(opts?.nxName || 'PastedSVG');

  // First preference: convert SVG paths into an editable Vision `nxpath` (not an image).
  // We do this before `putExternalContent` because tldraw SVG import can produce non-editable `image` shapes.
  const d = extractPathDFromSvg(svg);
  if (d) {
    // If tldraw already created/selected an `image` from this paste, delete it.
    const selectedImageIds = (() => {
      try {
        const ids = Array.from(ed.getSelectedShapeIds?.() || []);
        return ids.filter((id) => {
          const s = ed.getShape?.(id);
          return String(s?.type || '') === 'image';
        });
      } catch {
        return [] as unknown[];
      }
    })();

    const bbox = computeSvgPathsBBox(svg);
    const vb = readSvgViewBox(svg);
    const w = Math.max(1, Number(bbox?.w ?? vb?.w ?? 120));
    const h = Math.max(1, Number(bbox?.h ?? vb?.h ?? 120));
    const vbX = Number(bbox?.x ?? 0) || 0;
    const vbY = Number(bbox?.y ?? 0) || 0;

    const paint = extractBasicPaintFromSvg(svg);
    const { x, y } = computeViewportCenteredPastePoint(ed, w, h);

    const id = createShapeId();
    try {
      ed.createShape?.({
        id,
        type: 'nxpath',
        x,
        y,
        props: {
          w,
          h,
          d,
          ...(vbX || vbY ? { vbX, vbY } : null),
          fill: paint.fill || 'transparent',
          stroke: paint.stroke || '#111111ff',
          strokeWidth: paint.strokeWidth ?? (paint.stroke ? 2 : 0),
        },
        meta: { nxName },
      } as unknown);
      if (selectedImageIds.length) {
        try {
          ed.deleteShapes?.(selectedImageIds);
        } catch {
          // ignore
        }
      }
      ed.setSelectedShapes?.([id]);
      return true;
    } catch {
      // If shape creation fails, fall through to other strategies below.
    }
  }

  // Prefer tldraw's native external SVG import when available.
  try {
    if (typeof ed.putExternalContent === 'function') {
      const b = ed.getViewportPageBounds?.() || null;
      const bx = Number(b?.x ?? b?.minX ?? 0);
      const by = Number(b?.y ?? b?.minY ?? 0);
      const bw = Number(b?.w ?? b?.width ?? 0);
      const bh = Number(b?.h ?? b?.height ?? 0);
      const point =
        Number.isFinite(bx) && Number.isFinite(by) && Number.isFinite(bw) && Number.isFinite(bh)
          ? { x: bx + bw / 2, y: by + bh / 2 }
          : undefined;
      ed.putExternalContent({ type: 'svg', svg, ...(point ? { point } : null) } as unknown);
      return true;
    }
  } catch {
    // fall back to path extraction
  }

  if (!d) return false;

  const bbox = computeSvgPathsBBox(svg);
  const vb = readSvgViewBox(svg);
  const w = Math.max(1, Number(bbox?.w ?? vb?.w ?? 120));
  const h = Math.max(1, Number(bbox?.h ?? vb?.h ?? 120));
  const vbX = Number(bbox?.x ?? 0) || 0;
  const vbY = Number(bbox?.y ?? 0) || 0;
  const { x, y } = computeViewportCenteredPastePoint(ed, w, h);

  const id = createShapeId();
  try {
    ed.createShape?.({
      id,
      type: 'nxpath',
      x,
      y,
      props: {
        w,
        h,
        d,
        ...(vbX || vbY ? { vbX, vbY } : null),
        fill: '#111111ff',
        stroke: 'transparent',
        strokeWidth: 1,
      },
      meta: { nxName },
    } as unknown);
    ed.setSelectedShapes?.([id]);
    return true;
  } catch {
    return false;
  }
}

