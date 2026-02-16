'use client';

import type { Editor } from 'tldraw';
import { createShapeId, toRichText } from '@tldraw/tlschema';
import { makeTheme, nearestTokenForHex } from '@/components/vision/tldraw/ui/style-panel/color-utils';
import { isEllipseGeo, makeVisionEllipseFromGeo } from '@/components/vision/tldraw/autoconvert/convertEllipse';
import { editableToSvgPath, makeEllipseEditable, makeRectEditable, stringifyEditable } from '@/components/vision/tldraw/vector-pen/editablePath';

type VecModel = { x: number; y: number };

function isBooleanOpName(nm: string) {
  const s = String(nm || '').toLowerCase();
  return s.includes('boolean(') || s.startsWith('boolean');
}

function parseOnlyMoveLinePath(d: string): Array<VecModel[]> | null {
  const toks = String(d || '').match(/[ML]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  if (toks.length < 3) return null;
  const paths: Array<VecModel[]> = [];
  let cur: VecModel[] | null = null;
  let i = 0;
  const nextNum = () => {
    const s = toks[i++];
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  while (i < toks.length) {
    const t = toks[i++];
    if (!t) break;
    const cmd = t.toUpperCase();
    if (cmd !== 'M' && cmd !== 'L') return null;
    const x = nextNum();
    const y = nextNum();
    if (x === null || y === null) return null;
    if (cmd === 'M') {
      if (cur && cur.length >= 2) paths.push(cur);
      cur = [{ x, y }];
    } else {
      if (!cur) cur = [{ x, y }];
      else cur.push({ x, y });
    }
  }
  if (cur && cur.length >= 2) paths.push(cur);
  return paths.length ? paths : null;
}

function getArrowLikeEndpointsFromPath(d: string): { start: VecModel; end: VecModel; hasStartHead: boolean; hasEndHead: boolean } | null {
  const paths = parseOnlyMoveLinePath(d);
  if (!paths || paths.length === 0) return null;
  const main = paths[0];
  if (!main || main.length < 2) return null;
  const start = main[0];
  const end = main[main.length - 1];

  const near = (a: VecModel, b: VecModel) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  let hasStartHead = false;
  let hasEndHead = false;
  for (const p of paths.slice(1)) {
    for (const q of p) {
      if (near(q, start)) hasStartHead = true;
      if (near(q, end)) hasEndHead = true;
    }
  }
  return { start, end, hasStartHead, hasEndHead };
}

export function canConvertSelectionToVectorPoints(editor: Editor): boolean {
  const only: any = editor.getOnlySelectedShape();
  if (!only) return false;
  const t = String(only.type || '');
  if (t === 'nxrect') return true;
  if (t === 'geo' && isEllipseGeo(only)) return true;
  if (t === 'nxpath') return true;
  // Native arrows already have arrowhead + bend editing.
  return false;
}

export async function convertSelectionToVectorPoints(editor: Editor): Promise<void> {
  const only: any = editor.getOnlySelectedShape();
  if (!only) return;

  const theme = makeTheme(editor);

  const type = String(only.type || '');
  const nxName = String(only?.meta?.nxName || '');

  const x = Number(only.x || 0) || 0;
  const y = Number(only.y || 0) || 0;
  const rotation = only.rotation;
  const parentId = only.parentId;
  const index = only.index;
  const opacity = only.opacity;

  if (type === 'geo' && isEllipseGeo(only)) {
    const conv = makeVisionEllipseFromGeo(editor, only);
    if (!conv) return;
    const w = Number(conv.props?.w || 0) || 0;
    const h = Number(conv.props?.h || 0) || 0;
    if (w <= 1 || h <= 1) return;
    const edit = makeEllipseEditable(w, h);
    const d = editableToSvgPath(edit);
    const nextId = createShapeId();
    editor.createShape({
      id: nextId as any,
      type: 'nxpath',
      x: conv.x,
      y: conv.y,
      rotation: conv.rotation,
      parentId: conv.parentId,
      index: conv.index,
      opacity: conv.opacity,
      props: {
        w,
        h,
        d,
        fill: String(conv.props?.fill || '#111111'),
        stroke: String(conv.props?.stroke || 'transparent'),
        strokeWidth: Number(conv.props?.strokeWidth || 2) || 2,
        nxEdit: stringifyEditable(edit),
      },
      meta: { ...(only.meta || {}), nxName: nxName || 'Vector (bezier)', nxNoAutoConvert: true },
    } as any);
    editor.deleteShapes([only.id as any]);
    editor.setSelectedShapes([nextId as any]);
    return;
  }

  if (type === 'nxrect') {
    const w = Number(only.props?.w || 0) || 0;
    const h = Number(only.props?.h || 0) || 0;
    if (w <= 1 || h <= 1) return;
    const r = Number(only.props?.radius ?? 0) || 0;
    const rtl = only.props?.radiusUniform ? r : Number(only.props?.radiusTL ?? r) || 0;
    const rtr = only.props?.radiusUniform ? r : Number(only.props?.radiusTR ?? r) || 0;
    const rbr = only.props?.radiusUniform ? r : Number(only.props?.radiusBR ?? r) || 0;
    const rbl = only.props?.radiusUniform ? r : Number(only.props?.radiusBL ?? r) || 0;
    const edit = makeRectEditable(w, h, { tl: rtl, tr: rtr, br: rbr, bl: rbl });
    const d = editableToSvgPath(edit);
    const nextId = createShapeId();
    editor.createShape({
      id: nextId as any,
      type: 'nxpath',
      x,
      y,
      rotation,
      parentId,
      index,
      opacity,
      props: {
        w,
        h,
        d,
        fill: String(only.props?.fill || '#ffffff'),
        stroke: String(only.props?.stroke || '#111111'),
        strokeWidth: Number(only.props?.strokeWidth || 2) || 2,
        nxEdit: stringifyEditable(edit),
      },
      meta: { ...(only.meta || {}), nxName: (nxName || 'Vector') + ' (bezier)', nxNoAutoConvert: true },
    } as any);
    editor.deleteShapes([only.id as any]);
    editor.setSelectedShapes([nextId as any]);
    return;
  }

  if (type === 'nxpath' && nxName.toLowerCase().includes('visioncircle')) {
    const w = Number(only.props?.w || 0) || 0;
    const h = Number(only.props?.h || 0) || 0;
    if (w <= 1 || h <= 1) return;
    const edit = makeEllipseEditable(w, h);
    const d = editableToSvgPath(edit);
    const nextId = createShapeId();
    editor.createShape({
      id: nextId as any,
      type: 'nxpath',
      x,
      y,
      rotation,
      parentId,
      index,
      opacity,
      props: {
        w,
        h,
        d,
        fill: String(only.props?.fill || '#111111'),
        stroke: String(only.props?.stroke || 'transparent'),
        strokeWidth: Number(only.props?.strokeWidth || 2) || 2,
        nxEdit: stringifyEditable(edit),
      },
      meta: { ...(only.meta || {}), nxName: nxName || 'Vector (bezier)', nxNoAutoConvert: true },
    } as any);
    editor.deleteShapes([only.id as any]);
    editor.setSelectedShapes([nextId as any]);
    return;
  }

  if (type === 'nxpath' && nxName.toLowerCase().includes('visionarrow')) {
    const w = Number(only.props?.w || 0) || 0;
    const h = Number(only.props?.h || 0) || 0;
    const d = String(only.props?.d || '');
    const strokeHex = String(only.props?.stroke || '#111111');
    const fillHex = String(only.props?.fill || 'transparent');
    const strokeWidth = Number(only.props?.strokeWidth || 3) || 3;
    if (w <= 1 || h <= 1 || !d) return;
    const endpoints = getArrowLikeEndpointsFromPath(d);
    if (!endpoints) return;
    const colorToken =
      nearestTokenForHex({ theme, hex: strokeHex, variant: 'solid' }) ||
      nearestTokenForHex({ theme, hex: fillHex, variant: 'solid' }) ||
      'black';
    const nextId = createShapeId();
    editor.createShape({
      id: nextId as any,
      type: 'arrow',
      x,
      y,
      rotation,
      parentId,
      index,
      opacity,
      props: {
        kind: 'arc' as any,
        labelColor: colorToken as any,
        color: colorToken as any,
        fill: 'none' as any,
        dash: 'solid' as any,
        size: strokeWidth <= 2 ? ('s' as any) : strokeWidth <= 3 ? ('m' as any) : strokeWidth <= 5 ? ('l' as any) : ('xl' as any),
        arrowheadStart: (endpoints.hasStartHead ? 'arrow' : 'none') as any,
        arrowheadEnd: (endpoints.hasEndHead ? 'arrow' : 'arrow') as any,
        font: 'draw' as any,
        start: { x: endpoints.start.x, y: endpoints.start.y } as any,
        end: { x: endpoints.end.x, y: endpoints.end.y } as any,
        bend: 0,
        richText: toRichText('') as any,
        labelPosition: 0.5,
        scale: 1,
        elbowMidPoint: 0.5,
      },
      meta: { ...(only.meta || {}), nxName: 'Arrow', nxNoAutoConvert: true },
    } as any);
    editor.deleteShapes([only.id as any]);
    editor.setSelectedShapes([nextId as any]);
    return;
  }

  if (type === 'nxpath' && !isBooleanOpName(nxName)) {
    const w = Number(only.props?.w || 0) || 0;
    const h = Number(only.props?.h || 0) || 0;
    if (w <= 1 || h <= 1) return;
    const d0 = String(only.props?.d || '');
    const parsed = parseOnlyMoveLinePath(d0);
    if (!parsed) return;
    const first = parsed[0];
    if (!first || first.length < 2) return;
    const nodes = first.map((p, i) => ({
      id: `n_${i}_${Math.random().toString(36).slice(2, 6)}`,
      x: p.x,
      y: p.y,
      inX: p.x,
      inY: p.y,
      outX: p.x,
      outY: p.y,
    }));
    const edit = { v: 1 as const, kind: 'path' as const, closed: false as const, nodes };
    const d = editableToSvgPath(edit as any);
    const nextId = createShapeId();
    editor.createShape({
      id: nextId as any,
      type: 'nxpath',
      x,
      y,
      rotation,
      parentId,
      index,
      opacity,
      props: {
        w,
        h,
        d,
        fill: String(only.props?.fill || 'transparent'),
        stroke: String(only.props?.stroke || '#111111'),
        strokeWidth: Number(only.props?.strokeWidth || 2) || 2,
        nxEdit: stringifyEditable(edit as any),
      },
      meta: { ...(only.meta || {}), nxName: (nxName || 'Vector') + ' (path)', nxNoAutoConvert: true },
    } as any);
    editor.deleteShapes([only.id as any]);
    editor.setSelectedShapes([nextId as any]);
  }
}

