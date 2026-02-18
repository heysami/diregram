'use client';

import type { Editor } from 'tldraw';
import { getTheme, tokenToFillHex, tokenToSolidHex } from '@/components/vision/tldraw/autoconvert/colors';
import { makeDefaultFillLayer, makeDefaultStrokeLayer, serializeFillLayers, serializeStrokeLayers } from '@/components/vision/tldraw/paint/nxPaintLayers';
import { computeSvgPathsBBox, detectSvgFillOnlyPath, extractPathDFromSvg, readSvgViewBox } from '@/components/vision/tldraw/autoconvert/svgExtract';

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
  if (rec.type === 'nxpath' || rec.type === 'nxrect' || rec.type === 'nxtext' || rec.type === 'nxfx' || rec.type === 'nxlayout') return null;
  // Don't convert groups/frames; those are structural (and core frames are intentional).
  if (rec.type === 'group' || rec.type === 'frame' || rec.type === 'nxlayout') return null;

  // Respect opt-out.
  if (rec?.meta?.nxNoAutoConvert) return null;

  let svg = '';
  try {
    const r: any = await (editor as any).getSvgString?.([id], { padding: 0, background: false });
    svg = r?.svg ? String(r.svg) : '';
  } catch {
    svg = '';
  }
  const d = extractPathDFromSvg(svg);
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
  const vb = svg ? readSvgViewBox(svg) : null;
  const bbox = svg ? computeSvgPathsBBox(svg) : null;
  const w = Math.max(1, Number(bbox?.w ?? vb?.w ?? rec.props?.w ?? 120));
  const h = Math.max(1, Number(bbox?.h ?? vb?.h ?? rec.props?.h ?? 120));
  // Use path-space bbox origin for normalization in the renderer.
  const vbX = Number(bbox?.x ?? 0) || 0;
  const vbY = Number(bbox?.y ?? 0) || 0;

  // IMPORTANT: For some default shapes (notably `draw`), record `x/y` can be 0 even when the shape
  // is elsewhere. Prefer page bounds for placement to avoid "jump to top-left" after conversion.
  let pageX = Number(rec.x || 0);
  let pageY = Number(rec.y || 0);
  try {
    const b: any = (editor as any).getShapePageBounds?.(id as any);
    const bx = Number(b?.x ?? b?.minX ?? 0);
    const by = Number(b?.y ?? b?.minY ?? 0);
    if (Number.isFinite(bx) && Number.isFinite(by)) {
      pageX = bx;
      pageY = by;
    }
  } catch {
    // ignore
  }
  // Convert page-space position to parent-space coordinates (for nested shapes).
  let px = pageX;
  let py = pageY;
  try {
    const p = (editor as any).getPointInParentSpace?.(id as any, { x: pageX, y: pageY });
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      px = Number(p.x);
      py = Number(p.y);
    }
  } catch {
    // ignore
  }

  // Determine whether this is a "brush-like" filled path export (tldraw draw strokes often export as fill-only paths).
  const svgFillOnly = svg ? detectSvgFillOnlyPath(svg) : false;

  return {
    type: 'nxpath',
    x: px,
    y: py,
    rotation: rec.rotation,
    parentId: rec.parentId,
    index: rec.index,
    opacity: rec.opacity,
    props: {
      w,
      h,
      d,
      // Preserve SVG viewBox origin; tldraw exports sometimes use non-zero minX/minY.
      ...(vbX || vbY ? { vbX, vbY } : {}),

      // IMPORTANT: NXPathShapeUtil defaults include transparent stroke layers; override explicitly.
      fills: serializeFillLayers([
        makeDefaultFillLayer({
          mode: 'solid',
          // If svg exports as fill-only (brush stroke), treat fill as the primary paint.
          solid: svgFillOnly ? strokeHex : hasFill ? fillHex : 'transparent',
          stops: JSON.stringify([
            { offset: 0, color: svgFillOnly ? strokeHex : hasFill ? fillHex : 'transparent' },
            { offset: 1, color: svgFillOnly ? strokeHex : hasFill ? fillHex : 'transparent' },
          ]),
          pattern: 'stripes',
          angle: 45,
          gx0: 0,
          gy0: 0,
          gx1: 1,
          gy1: 0,
        } as any),
      ]),
      strokes: serializeStrokeLayers([
        makeDefaultStrokeLayer({
          mode: 'solid',
          solid: svgFillOnly ? 'transparent' : strokeHex,
          stops: JSON.stringify([
            { offset: 0, color: svgFillOnly ? 'transparent' : strokeHex },
            { offset: 1, color: svgFillOnly ? 'transparent' : strokeHex },
          ]),
          pattern: 'dots',
          angle: 45,
          width: svgFillOnly ? 0 : strokeWidth,
          align: 'center',
          dash: { kind: 'solid' },
          cap: 'round',
          join: 'round',
          gx0: 0,
          gy0: 0,
          gx1: 1,
          gy1: 0,
        } as any),
      ]),

      // Shared paint model
      fillMode: 'solid',
      fill: svgFillOnly ? strokeHex : hasFill ? fillHex : 'transparent',
      fillA: svgFillOnly ? strokeHex : hasFill ? fillHex : 'transparent',
      fillB: '#ffffff',
      fillAngle: 45,
      fillStops: JSON.stringify([
        { offset: 0, color: svgFillOnly ? strokeHex : hasFill ? fillHex : 'transparent' },
        { offset: 1, color: svgFillOnly ? strokeHex : hasFill ? fillHex : 'transparent' },
      ]),
      fillPattern: 'stripes',

      strokeMode: 'solid',
      stroke: svgFillOnly ? 'transparent' : strokeHex,
      strokeA: svgFillOnly ? 'transparent' : strokeHex,
      strokeB: '#ffffff',
      strokeAngle: 45,
      strokeStops: JSON.stringify([
        { offset: 0, color: svgFillOnly ? 'transparent' : strokeHex },
        { offset: 1, color: svgFillOnly ? 'transparent' : strokeHex },
      ]),
      strokePattern: 'dots',

      strokeWidth: svgFillOnly ? 0 : strokeWidth,
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

