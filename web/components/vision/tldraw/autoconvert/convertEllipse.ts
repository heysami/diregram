'use client';

import type { Editor } from 'tldraw';
import { ellipsePath } from '@/components/vision/tldraw/autoconvert/geom';
import { getTheme, tokenToFillHex, tokenToSolidHex } from '@/components/vision/tldraw/autoconvert/colors';

export type EllipseConversion = {
  type: 'nxpath';
  x: number;
  y: number;
  rotation: any;
  parentId: any;
  index: any;
  opacity: any;
  props: { w: number; h: number; d: string; fill: string; stroke: string; strokeWidth: number };
  meta: any;
};

export function isEllipseGeo(rec: any) {
  return rec?.type === 'geo' && ['ellipse', 'circle', 'oval'].includes(String(rec?.props?.geo || ''));
}

export function makeVisionEllipseFromGeo(editor: Editor, rec: any): EllipseConversion | null {
  if (!isEllipseGeo(rec)) return null;
  const w = Number(rec.props?.w || 0);
  const h = Number(rec.props?.h || 0);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 12 || h < 12) return null;

  const theme = getTheme(editor as any);
  const token = String(rec.props?.color || 'black');
  const fillStyle = String(rec.props?.fill || 'none');
  const fillHex = tokenToFillHex(theme, token, fillStyle, '#ffffff');
  const strokeHex = tokenToSolidHex(theme, token, '#111111');

  const ww = Number(rec.props?.w || 120);
  const hh = Number(rec.props?.h || 120);
  return {
    type: 'nxpath',
    x: rec.x,
    y: rec.y,
    rotation: rec.rotation,
    parentId: rec.parentId,
    index: rec.index,
    opacity: rec.opacity,
    props: { w: ww, h: hh, d: ellipsePath(ww, hh), fill: fillHex, stroke: strokeHex, strokeWidth: 2 },
    meta: { ...(rec.meta || {}), nxName: rec.meta?.nxName || 'VisionCircle', nxNoAutoConvert: true },
  };
}

