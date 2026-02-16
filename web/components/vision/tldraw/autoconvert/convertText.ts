'use client';

import type { Editor } from 'tldraw';
import { getTheme, tokenToSolidHex } from '@/components/vision/tldraw/autoconvert/colors';

export type TextConversion = {
  type: 'nxtext';
  x: number;
  y: number;
  rotation: any;
  parentId: any;
  index: any;
  opacity: any;
  props: any;
  meta: any;
};

export function makeVisionTextFromTldrawText(editor: Editor, rec: any): TextConversion | null {
  if (!rec || rec.type !== 'text') return null;

  // Don't convert while editing that text.
  try {
    const editingId = (editor as any).getEditingShapeId?.();
    if (String(editingId || '') === String(rec.id || '')) return null;
  } catch {
    // ignore
  }

  const theme = getTheme(editor as any);
  const token = String(rec.props?.color || 'black');
  const fillHex = tokenToSolidHex(theme, token, '#111111');

  // Extract text best-effort.
  let txt = '';
  try {
    txt = String((editor as any).getShapeUtil?.(rec)?.getText?.(rec) || '');
  } catch {
    txt = '';
  }
  if (!txt) {
    txt = String(rec.props?.text || rec.props?.richText?.content?.[0]?.content?.[0]?.text || 'Text');
  }

  const alignToken = String(rec.props?.textAlign || 'start');
  const align = alignToken === 'end' ? 'right' : alignToken === 'middle' ? 'center' : 'left';

  const sizeToken = String(rec.props?.size || 'm');
  const fontSize = sizeToken === 's' ? 18 : sizeToken === 'l' ? 32 : sizeToken === 'xl' ? 48 : 24;

  const fontToken = String(rec.props?.font || 'draw');
  const fontFamily =
    fontToken === 'mono'
      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
      : fontToken === 'serif'
        ? 'ui-serif, Georgia, serif'
        : 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

  // Use geometry bounds if available.
  let w = Number(rec.props?.w || 240);
  let h = Number(rec.props?.h || 64);
  try {
    const bounds = (editor as any).getShapeGeometry?.(rec.id as any)?.bounds;
    if (bounds) {
      const bw = Number(bounds.width || 0);
      const bh = Number(bounds.height || 0);
      if (Number.isFinite(bw) && bw > 0) w = bw;
      if (Number.isFinite(bh) && bh > 0) h = bh;
    }
  } catch {
    // ignore
  }

  return {
    type: 'nxtext',
    x: rec.x,
    y: rec.y,
    rotation: rec.rotation,
    parentId: rec.parentId,
    index: rec.index,
    opacity: rec.opacity,
    props: {
      w,
      h,
      text: txt,
      fontSize,
      fontFamily,
      align,

      fillMode: 'solid',
      fill: fillHex,
      fillStops: JSON.stringify([
        { offset: 0, color: fillHex },
        { offset: 1, color: fillHex },
      ]),
      fillPattern: 'stripes',

      strokeMode: 'solid',
      stroke: '#000000',
      strokeStops: JSON.stringify([
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#000000' },
      ]),
      strokeWidth: 0,
      strokePattern: 'dots',

      gx0: 0,
      gy0: 0,
      gx1: 1,
      gy1: 0,
    },
    meta: { ...(rec.meta || {}), nxName: rec.meta?.nxName || 'VisionText', nxNoAutoConvert: true },
  };
}

