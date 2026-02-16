'use client';

import type { Editor } from 'tldraw';
import { getTheme, tokenToFillHex, tokenToSolidHex } from '@/components/vision/tldraw/autoconvert/colors';

type PathConversion = {
  type: 'nxpath';
  x: number;
  y: number;
  rotation: any;
  parentId: any;
  index: any;
  opacity: any;
  props: any;
  meta: any;
};

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function extractPathD(svgFragment: string): string {
  try {
    const doc = new DOMParser().parseFromString(String(svgFragment || ''), 'image/svg+xml');
    const paths = Array.from(doc.querySelectorAll('path'));
    const ds = paths
      .map((p) => p.getAttribute('d') || '')
      .map((s) => s.trim())
      .filter(Boolean);
    return ds.join(' ');
  } catch {
    return '';
  }
}

function readSvgSize(svg: string): { w: number; h: number } | null {
  try {
    const doc = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
    const root = doc.querySelector('svg');
    if (!root) return null;
    const vb = String(root.getAttribute('viewBox') || '');
    const m = vb.match(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/);
    if (m) {
      const w = Number(m[3]);
      const h = Number(m[4]);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h };
    }
    const wAttr = Number(root.getAttribute('width') || 0);
    const hAttr = Number(root.getAttribute('height') || 0);
    if (Number.isFinite(wAttr) && Number.isFinite(hAttr) && wAttr > 0 && hAttr > 0) return { w: wAttr, h: hAttr };
  } catch {
    // ignore
  }
  return null;
}

function sizeTokenToStrokeWidth(sizeToken: string): number {
  const s = String(sizeToken || 'm');
  return s === 's' ? 2 : s === 'l' ? 4 : s === 'xl' ? 6 : 3;
}

/**
 * Best-effort conversion for default tldraw shapes (geo/draw/line/etc.) into a Vision `nxpath`.
 * Uses `editor.getSvgString` and extracts `<path d="...">` commands.
 */
export async function tryMakeVisionPathFromAnyTldrawShape(editor: Editor, rec: any): Promise<PathConversion | null> {
  if (!rec || !rec.id) return null;
  const id = String(rec.id);

  // Avoid converting Vision-native shapes.
  if (rec.type === 'nxpath' || rec.type === 'nxrect' || rec.type === 'nxtext' || rec.type === 'nxfx') return null;
  // Don't convert groups/frames; those are structural (and core frames are intentional).
  if (rec.type === 'group' || rec.type === 'frame') return null;

  // Respect opt-out.
  if (rec?.meta?.nxNoAutoConvert) return null;

  let svg = '';
  try {
    const r: any = await (editor as any).getSvgString?.([id], { padding: 0, background: false });
    svg = r?.svg ? String(r.svg) : '';
  } catch {
    svg = '';
  }
  const d = extractPathD(svg);
  if (!d) return null;

  const theme = getTheme(editor as any);
  const token = String(rec.props?.color || 'black');
  const fillStyle = String(rec.props?.fill || 'none');

  // Default: keep common "shape" look: filled if fillStyle != none, stroked otherwise.
  const fillHex = tokenToFillHex(theme, token, fillStyle, '#ffffff');
  const strokeHex = tokenToSolidHex(theme, token, '#111111');
  const hasFill = fillStyle !== 'none' && fillStyle !== 'transparent';

  const sizeToken = String(rec.props?.size || 'm');
  const strokeWidth = sizeTokenToStrokeWidth(sizeToken);

  // Prefer actual SVG size; fall back to record props.
  const sz = svg ? readSvgSize(svg) : null;
  const w = Math.max(1, Number(sz?.w ?? rec.props?.w ?? 120));
  const h = Math.max(1, Number(sz?.h ?? rec.props?.h ?? 120));

  return {
    type: 'nxpath',
    x: rec.x,
    y: rec.y,
    rotation: rec.rotation,
    parentId: rec.parentId,
    index: rec.index,
    opacity: rec.opacity,
    props: {
      w,
      h,
      d,

      // Shared paint model
      fillMode: 'solid',
      fill: hasFill ? fillHex : 'transparent',
      fillA: hasFill ? fillHex : 'transparent',
      fillB: '#ffffff',
      fillAngle: 45,
      fillStops: JSON.stringify([
        { offset: 0, color: hasFill ? fillHex : 'transparent' },
        { offset: 1, color: hasFill ? fillHex : 'transparent' },
      ]),
      fillPattern: 'stripes',

      strokeMode: 'solid',
      stroke: strokeHex,
      strokeA: strokeHex,
      strokeB: '#ffffff',
      strokeAngle: 45,
      strokeStops: JSON.stringify([
        { offset: 0, color: strokeHex },
        { offset: 1, color: strokeHex },
      ]),
      strokePattern: 'dots',

      strokeWidth,
      gx0: 0,
      gy0: 0,
      gx1: 1,
      gy1: 0,
      fillGx0: 0,
      fillGy0: 0,
      fillGx1: 1,
      fillGy1: 0,
      strokeGx0: 0,
      strokeGy0: 0,
      strokeGx1: 1,
      strokeGy1: 0,
    },
    meta: { ...(rec.meta || {}), nxName: rec.meta?.nxName || `VisionPath(${String(rec.type || 'shape')})`, nxNoAutoConvert: true },
  };
}

