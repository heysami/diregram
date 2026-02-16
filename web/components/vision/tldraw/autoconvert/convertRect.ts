'use client';

import type { Editor } from 'tldraw';
import { getTheme, tokenToFillHex, tokenToSolidHex } from '@/components/vision/tldraw/autoconvert/colors';

export type RectConversion = {
  type: 'nxrect';
  x: number;
  y: number;
  rotation: any;
  parentId: any;
  index: any;
  opacity: any;
  props: any;
  meta: any;
};

export function isRectGeo(rec: any) {
  return rec?.type === 'geo' && String(rec?.props?.geo || '') === 'rectangle';
}

export function makeVisionRectFromGeo(editor: Editor, rec: any): RectConversion | null {
  if (!isRectGeo(rec)) return null;
  const w = Number(rec.props?.w || 0);
  const h = Number(rec.props?.h || 0);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 12 || h < 12) return null;

  const theme = getTheme(editor as any);
  const token = String(rec.props?.color || 'black');
  const fillStyle = String(rec.props?.fill || 'none');
  const fillHex = tokenToFillHex(theme, token, fillStyle, '#ffffff');
  const strokeHex = tokenToSolidHex(theme, token, '#111111');

  return {
    type: 'nxrect',
    x: rec.x,
    y: rec.y,
    rotation: rec.rotation,
    parentId: rec.parentId,
    index: rec.index,
    opacity: rec.opacity,
    props: {
      w: Number(rec.props?.w || 160),
      h: Number(rec.props?.h || 100),
      fillMode: 'solid',
      fill: fillHex,
      strokeMode: 'solid',
      stroke: strokeHex,
      strokeUniform: true,
      strokeWidth: 2,
      radiusUniform: true,
      radius: 12,
    },
    meta: { ...(rec.meta || {}), nxName: rec.meta?.nxName || 'VisionRect', nxNoAutoConvert: true },
  };
}

