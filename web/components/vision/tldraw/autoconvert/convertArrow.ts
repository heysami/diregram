'use client';

import type { Editor } from 'tldraw';
import { add, boundsOf, len, mul, norm, perp, pt, sub, type Pt } from '@/components/vision/tldraw/autoconvert/geom';
import { getTheme, tokenToSolidHex } from '@/components/vision/tldraw/autoconvert/colors';
import { makeDefaultFillLayer, makeDefaultStrokeLayer, serializeFillLayers, serializeStrokeLayers } from '@/components/vision/tldraw/paint/nxPaintLayers';

export type ArrowConversion = {
  type: 'nxpath';
  x: number;
  y: number;
  rotation: any;
  parentId: any;
  index: any;
  opacity: any;
  props: {
    w: number;
    h: number;
    d: string;
    fills: string;
    strokes: string;
    fillMode: 'solid';
    fill: string;
    strokeMode: 'solid';
    stroke: string;
    strokeWidth: number;
  };
  meta: any;
};

export async function tryMakeVisionArrowFromTldrawArrow(editor: Editor, rec: any): Promise<ArrowConversion | null> {
  if (!rec || rec.type !== 'arrow') return null;

  const s0 = pt(rec?.props?.start?.x, rec?.props?.start?.y);
  const e0 = pt(rec?.props?.end?.x, rec?.props?.end?.y);
  const dir = sub(e0, s0);
  const dlen = len(dir);
  if (!Number.isFinite(dlen) || dlen < 2) return null;

  const theme = getTheme(editor as any);
  const token = String(rec.props?.color || 'black');
  const strokeHex = tokenToSolidHex(theme, token, '#111111');

  const sizeToken = String(rec.props?.size || 'm');
  const strokeWidth = sizeToken === 's' ? 2 : sizeToken === 'l' ? 4 : sizeToken === 'xl' ? 6 : 3;

  const u = norm(dir);
  const n = perp(u);
  const headLen = Math.max(10, strokeWidth * 4);
  const headW = Math.max(8, headLen * 0.75);

  const arrowheadStart = String(rec.props?.arrowheadStart || 'none');
  const arrowheadEnd = String(rec.props?.arrowheadEnd || 'arrow');

  const endBase = sub(e0, mul(u, headLen));
  const endL = add(endBase, mul(n, headW / 2));
  const endR = add(endBase, mul(n, -headW / 2));

  const pts: Pt[] = [s0, e0, endL, endR];
  let startL: Pt | null = null;
  let startR: Pt | null = null;
  if (arrowheadStart && arrowheadStart !== 'none') {
    const startBase = add(s0, mul(u, headLen));
    startL = add(startBase, mul(n, headW / 2));
    startR = add(startBase, mul(n, -headW / 2));
    pts.push(startL, startR);
  }

  const b = boundsOf(pts);
  const pad = Math.max(4, strokeWidth * 2);
  const minX = b.minX - pad;
  const minY = b.minY - pad;
  const w = Math.max(1, b.maxX - b.minX + pad * 2);
  const h = Math.max(1, b.maxY - b.minY + pad * 2);

  const sx = s0.x - minX;
  const sy = s0.y - minY;
  const ex = e0.x - minX;
  const ey = e0.y - minY;
  const elx = endL.x - minX;
  const ely = endL.y - minY;
  const erx = endR.x - minX;
  const ery = endR.y - minY;

  const parts: string[] = [];
  parts.push(`M ${sx} ${sy} L ${ex} ${ey}`);
  if (arrowheadEnd && arrowheadEnd !== 'none') {
    parts.push(`M ${elx} ${ely} L ${ex} ${ey} L ${erx} ${ery}`);
  }
  if (startL && startR) {
    const slx = startL.x - minX;
    const sly = startL.y - minY;
    const srx = startR.x - minX;
    const sry = startR.y - minY;
    parts.push(`M ${slx} ${sly} L ${sx} ${sy} L ${srx} ${sry}`);
  }
  const d = parts.join(' ');
  if (!d) return null;

  return {
    type: 'nxpath',
    x: Number(rec.x || 0) + minX,
    y: Number(rec.y || 0) + minY,
    rotation: rec.rotation,
    parentId: rec.parentId,
    index: rec.index,
    opacity: rec.opacity,
    props: {
      w,
      h,
      d,
      // IMPORTANT: NXPathShapeUtil defaults include transparent stroke layers; override explicitly.
      fills: serializeFillLayers([
        makeDefaultFillLayer({
          mode: 'solid',
          solid: 'transparent',
          stops: JSON.stringify([
            { offset: 0, color: 'transparent' },
            { offset: 1, color: 'transparent' },
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
          solid: strokeHex,
          stops: JSON.stringify([
            { offset: 0, color: strokeHex },
            { offset: 1, color: strokeHex },
          ]),
          pattern: 'dots',
          angle: 45,
          width: strokeWidth,
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
      fillMode: 'solid',
      fill: 'transparent',
      strokeMode: 'solid',
      stroke: strokeHex,
      strokeWidth,
    },
    meta: { ...(rec.meta || {}), nxName: rec.meta?.nxName || 'VisionArrow', nxNoAutoConvert: true },
  };
}

