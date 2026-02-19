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

function parseSvgPathToEditable(d: string): { closed: boolean; nodes: Array<{ x: number; y: number; inX: number; inY: number; outX: number; outY: number }> } | null {
  const s = String(d || '').trim();
  if (!s) return null;

  const toks = s.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  if (toks.length < 4) return null;

  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let started = false;
  let closed = false;

  const nodes: Array<{ x: number; y: number; inX: number; inY: number; outX: number; outY: number }> = [];
  const nextNum = (): number | null => {
    const t = toks[i++];
    if (t == null) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const isCmd = (t: string) => /^[a-zA-Z]$/.test(t);

  const pushNode = (x: number, y: number) => {
    nodes.push({ x, y, inX: x, inY: y, outX: x, outY: y });
  };

  const ensureStart = () => {
    if (!started) {
      started = true;
      sx = cx;
      sy = cy;
      pushNode(cx, cy);
    }
  };

  while (i < toks.length) {
    const t = toks[i];
    if (!t) break;
    if (isCmd(t)) {
      cmd = t;
      i++;
    } else if (!cmd) {
      return null;
    }

    const abs = cmd === cmd.toUpperCase();
    const c = cmd.toUpperCase();

    if (c === 'M') {
      const x = nextNum();
      const y = nextNum();
      if (x == null || y == null) return null;
      cx = abs ? x : cx + x;
      cy = abs ? y : cy + y;
      // New subpath: we only keep the first.
      if (started) break;
      started = true;
      sx = cx;
      sy = cy;
      nodes.length = 0;
      pushNode(cx, cy);
      // Subsequent coordinate pairs after M are treated as implicit L.
      cmd = abs ? 'L' : 'l';
      continue;
    }

    if (c === 'Z') {
      if (started) closed = true;
      cx = sx;
      cy = sy;
      cmd = '';
      continue;
    }

    if (c === 'L') {
      ensureStart();
      while (i < toks.length && !isCmd(toks[i]!)) {
        const x = nextNum();
        const y = nextNum();
        if (x == null || y == null) return null;
        cx = abs ? x : cx + x;
        cy = abs ? y : cy + y;
        pushNode(cx, cy);
      }
      continue;
    }

    if (c === 'C') {
      ensureStart();
      while (i < toks.length && !isCmd(toks[i]!)) {
        const x1 = nextNum();
        const y1 = nextNum();
        const x2 = nextNum();
        const y2 = nextNum();
        const x = nextNum();
        const y = nextNum();
        if (x1 == null || y1 == null || x2 == null || y2 == null || x == null || y == null) return null;

        const c1x = abs ? x1 : cx + x1;
        const c1y = abs ? y1 : cy + y1;
        const c2x = abs ? x2 : cx + x2;
        const c2y = abs ? y2 : cy + y2;
        const ex = abs ? x : cx + x;
        const ey = abs ? y : cy + y;

        const last = nodes[nodes.length - 1];
        if (last) {
          last.outX = c1x;
          last.outY = c1y;
        }
        pushNode(ex, ey);
        const next = nodes[nodes.length - 1];
        if (next) {
          next.inX = c2x;
          next.inY = c2y;
        }
        cx = ex;
        cy = ey;
      }
      continue;
    }

    // Unsupported command (Q/S/A/H/V/etc.) => give up.
    return null;
  }

  if (nodes.length < 2) return null;
  if (closed && nodes.length >= 3) {
    // Common in exported SVG: last cubic returns to start, followed by `Z`.
    // Our editable format expects the start node to be the closure target (no duplicated end node).
    const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first && last && eq(first.x, last.x) && eq(first.y, last.y)) {
      // Preserve the incoming control handle into the start node.
      first.inX = last.inX;
      first.inY = last.inY;
      nodes.pop();
    }
  }
  return { closed, nodes };
}

function parseSvgPathToEditableSubpaths(
  d: string,
): Array<{ closed: boolean; nodes: Array<{ x: number; y: number; inX: number; inY: number; outX: number; outY: number }> }> | null {
  const s = String(d || '').trim();
  if (!s) return null;
  const toks = s.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  if (toks.length < 4) return null;

  // Split token stream into subpaths on subsequent M/m commands.
  const subTokens: string[][] = [];
  let cur: string[] = [];
  let seenMove = false;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (/^[a-zA-Z]$/.test(t) && t.toUpperCase() === 'M') {
      if (seenMove && cur.length) {
        subTokens.push(cur);
        cur = [];
      }
      seenMove = true;
    }
    cur.push(t);
  }
  if (cur.length) subTokens.push(cur);
  if (!subTokens.length) return null;

  const out: Array<{ closed: boolean; nodes: Array<{ x: number; y: number; inX: number; inY: number; outX: number; outY: number }> }> = [];
  for (const st of subTokens) {
    const parsed = parseSvgPathToEditable(st.join(' '));
    if (parsed && parsed.nodes.length >= 2) out.push(parsed);
  }
  return out.length ? out : null;
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
  const vbX = Number(only?.props?.vbX ?? 0) || 0;
  const vbY = Number(only?.props?.vbY ?? 0) || 0;

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
    const moveCount = (() => {
      try {
        return (d0.match(/[Mm]/g) || []).length;
      } catch {
        return 0;
      }
    })();
    const preferSubpaths = moveCount > 1;

    const parsed = parseOnlyMoveLinePath(d0);
    const editsFromSvg = !parsed && preferSubpaths ? parseSvgPathToEditableSubpaths(d0) : null;
    const editFromSvg = !parsed && !preferSubpaths ? parseSvgPathToEditable(d0) : null;
    const singleFromSubpaths = !parsed && !editFromSvg && editsFromSvg && editsFromSvg.length === 1 ? editsFromSvg[0] : null;
    const cmdSet = (() => {
      try {
        const m = d0.match(/[a-zA-Z]/g) || [];
        const uniq = Array.from(new Set(m.map((c) => c.toUpperCase()))).sort();
        return uniq.slice(0, 24);
      } catch {
        return [];
      }
    })();
    if (!parsed && !editFromSvg && !singleFromSubpaths && !editsFromSvg) return;

    // Multi-subpath SVG: convert into multiple editable `nxpath` shapes instead of truncating to the first.
    if (!parsed && !editFromSvg && editsFromSvg && editsFromSvg.length >= 2) {
      const created: any[] = [];
      const max = Math.min(editsFromSvg.length, 24);
      for (let k = 0; k < max; k++) {
        const sub = editsFromSvg[k]!;
        const nodes = (sub.nodes || []).map((p, i) => ({
          id: `n_${k}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          x: p.x,
          y: p.y,
          inX: p.inX,
          inY: p.inY,
          outX: p.outX,
          outY: p.outY,
        }));
        const edit = { v: 1 as const, kind: 'path' as const, closed: (sub.closed ?? false) as any, nodes };
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
            ...(vbX || vbY ? { vbX, vbY } : {}),
            fill: String(only.props?.fill || 'transparent'),
            stroke: String(only.props?.stroke || '#111111'),
            strokeWidth: Number(only.props?.strokeWidth || 2) || 2,
            nxEdit: stringifyEditable(edit as any),
          },
          meta: { ...(only.meta || {}), nxName: (nxName || 'Vector') + ` (path ${k + 1}/${max})`, nxNoAutoConvert: true },
        } as any);
        created.push(nextId as any);
      }
      editor.deleteShapes([only.id as any]);
      editor.setSelectedShapes(created);
      return;
    }

    const effEditFromSvg = editFromSvg || singleFromSubpaths;
    const nodes = parsed
      ? (parsed[0] || []).map((p, i) => ({
          id: `n_${i}_${Math.random().toString(36).slice(2, 6)}`,
          x: p.x,
          y: p.y,
          inX: p.x,
          inY: p.y,
          outX: p.x,
          outY: p.y,
        }))
      : (effEditFromSvg!.nodes || []).map((p, i) => ({
          id: `n_${i}_${Math.random().toString(36).slice(2, 6)}`,
          x: p.x,
          y: p.y,
          inX: p.inX,
          inY: p.inY,
          outX: p.outX,
          outY: p.outY,
        }));
    const edit = { v: 1 as const, kind: 'path' as const, closed: (effEditFromSvg?.closed ?? false) as any, nodes };
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
        ...(vbX || vbY ? { vbX, vbY } : {}),
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

