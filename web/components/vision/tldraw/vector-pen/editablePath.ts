'use client';

export type NxBezierNode = {
  id: string;
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
};

export type NxEditablePathData =
  | {
      v: 1;
      kind: 'ellipse';
      closed: true;
      nodes: NxBezierNode[];
    }
  | {
      v: 1;
      kind: 'rect';
      closed: true;
      rTL: number;
      rTR: number;
      rBR: number;
      rBL: number;
      nodes: NxBezierNode[];
    }
  | {
      v: 1;
      kind: 'path';
      closed: boolean;
      nodes: NxBezierNode[];
    };

const KAPPA = 0.5522847498307936;

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function isCubic(curr: NxBezierNode, next: NxBezierNode) {
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const currStraight = eq(curr.outX, curr.x) && eq(curr.outY, curr.y);
  const nextStraight = eq(next.inX, next.x) && eq(next.inY, next.y);
  return !(currStraight && nextStraight);
}

export function editableToSvgPath(data: NxEditablePathData): string {
  const nodes = Array.isArray((data as any)?.nodes) ? (data as any).nodes : [];
  if (nodes.length < 2) return '';
  const parts: string[] = [];
  const n = nodes.length;
  const closed = !!(data as any).closed;
  parts.push(`M ${nodes[0].x} ${nodes[0].y}`);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const curr = nodes[i];
    const next = nodes[(i + 1) % n];
    if (isCubic(curr, next)) {
      parts.push(`C ${curr.outX} ${curr.outY} ${next.inX} ${next.inY} ${next.x} ${next.y}`);
    } else {
      parts.push(`L ${next.x} ${next.y}`);
    }
  }
  if (closed) parts.push('Z');
  return parts.join(' ');
}

export function tryParseEditable(json: unknown): NxEditablePathData | null {
  if (typeof json !== 'string' || !json.trim()) return null;
  try {
    const o = JSON.parse(json);
    if (!o || typeof o !== 'object') return null;
    if ((o as any).v !== 1) return null;
    if ((o as any).kind !== 'ellipse' && (o as any).kind !== 'rect' && (o as any).kind !== 'path') return null;
    if (!Array.isArray((o as any).nodes) || (o as any).nodes.length < 2) return null;
    if ((o as any).kind === 'rect') {
      const r = Number((o as any).r || 0) || 0;
      if (typeof (o as any).rTL !== 'number') (o as any).rTL = r;
      if (typeof (o as any).rTR !== 'number') (o as any).rTR = r;
      if (typeof (o as any).rBR !== 'number') (o as any).rBR = r;
      if (typeof (o as any).rBL !== 'number') (o as any).rBL = r;
      delete (o as any).r;
    }
    return o as NxEditablePathData;
  } catch {
    return null;
  }
}

export function stringifyEditable(data: NxEditablePathData): string {
  return JSON.stringify(data);
}

export function makeEllipseEditable(w: number, h: number): NxEditablePathData {
  const ww = Math.max(1, Number(w || 1));
  const hh = Math.max(1, Number(h || 1));
  const rx = ww / 2;
  const ry = hh / 2;
  const cx = rx;
  const cy = ry;
  const ox = KAPPA * rx;
  const oy = KAPPA * ry;

  const n0: NxBezierNode = { id: `n_${uid()}`, x: cx, y: 0, inX: cx - ox, inY: 0, outX: cx + ox, outY: 0 };
  const n1: NxBezierNode = { id: `n_${uid()}`, x: ww, y: cy, inX: ww, inY: cy - oy, outX: ww, outY: cy + oy };
  const n2: NxBezierNode = { id: `n_${uid()}`, x: cx, y: hh, inX: cx + ox, inY: hh, outX: cx - ox, outY: hh };
  const n3: NxBezierNode = { id: `n_${uid()}`, x: 0, y: cy, inX: 0, inY: cy + oy, outX: 0, outY: cy - oy };
  return { v: 1, kind: 'ellipse', closed: true, nodes: [n0, n1, n2, n3] };
}

export function makeRectEditable(
  w: number,
  h: number,
  radii: { tl: number; tr: number; br: number; bl: number } | number,
): NxEditablePathData {
  const ww = Math.max(1, Number(w || 1));
  const hh = Math.max(1, Number(h || 1));
  const cap = (v: number) => clamp(Number(v || 0), 0, Math.min(ww, hh) / 2);
  const rr =
    typeof radii === 'number'
      ? { tl: cap(radii), tr: cap(radii), br: cap(radii), bl: cap(radii) }
      : { tl: cap(radii.tl), tr: cap(radii.tr), br: cap(radii.br), bl: cap(radii.bl) };

  const sum = rr.tl + rr.tr + rr.br + rr.bl;
  const a = (x: number, y: number) =>
    ({ id: `n_${uid()}`, x, y, inX: x, inY: y, outX: x, outY: y }) satisfies NxBezierNode;

  if (sum === 0) {
    return {
      v: 1,
      kind: 'rect',
      closed: true,
      rTL: 0,
      rTR: 0,
      rBR: 0,
      rBL: 0,
      nodes: [a(0, 0), a(ww, 0), a(ww, hh), a(0, hh)],
    };
  }

  const kTL = KAPPA * rr.tl;
  const kTR = KAPPA * rr.tr;
  const kBR = KAPPA * rr.br;
  const kBL = KAPPA * rr.bl;

  // Dynamic nodes: sharp corner => 1 node, rounded => 2 tangent nodes.
  const nodes: NxBezierNode[] = [];
  const TL_top = rr.tl > 0 ? a(rr.tl, 0) : a(0, 0);
  const TR_top = rr.tr > 0 ? a(ww - rr.tr, 0) : a(ww, 0);
  const TR_right = rr.tr > 0 ? a(ww, rr.tr) : null;
  const BR_right = rr.br > 0 ? a(ww, hh - rr.br) : a(ww, hh);
  const BR_bottom = rr.br > 0 ? a(ww - rr.br, hh) : null;
  const BL_bottom = rr.bl > 0 ? a(rr.bl, hh) : a(0, hh);
  const BL_left = rr.bl > 0 ? a(0, hh - rr.bl) : null;
  const TL_left = rr.tl > 0 ? a(0, rr.tl) : null;

  nodes.push(TL_top);
  if (TR_top.x !== TL_top.x || TR_top.y !== TL_top.y) nodes.push(TR_top);
  if (TR_right) nodes.push(TR_right);
  if (BR_right.x !== nodes[nodes.length - 1].x || BR_right.y !== nodes[nodes.length - 1].y) nodes.push(BR_right);
  if (BR_bottom) nodes.push(BR_bottom);
  if (BL_bottom.x !== nodes[nodes.length - 1].x || BL_bottom.y !== nodes[nodes.length - 1].y) nodes.push(BL_bottom);
  if (BL_left) nodes.push(BL_left);
  if (TL_left) nodes.push(TL_left);

  // Reset controls (straight by default).
  for (const n of nodes) {
    n.inX = n.x;
    n.inY = n.y;
    n.outX = n.x;
    n.outY = n.y;
  }

  // Apply corner cubics when tangent pairs exist.
  if (rr.tr > 0 && TR_right) {
    const iTop = nodes.indexOf(TR_top);
    if (iTop >= 0 && nodes[iTop + 1] === TR_right) {
      TR_top.outX = TR_top.x + kTR;
      TR_right.inY = TR_right.y - kTR;
    }
  }
  if (rr.br > 0 && BR_bottom) {
    const iR = nodes.indexOf(BR_right);
    if (iR >= 0 && nodes[iR + 1] === BR_bottom) {
      BR_right.outY = BR_right.y + kBR;
      BR_bottom.inX = BR_bottom.x + kBR;
    }
  }
  if (rr.bl > 0 && BL_left) {
    const iB = nodes.indexOf(BL_bottom);
    if (iB >= 0 && nodes[iB + 1] === BL_left) {
      BL_bottom.outX = BL_bottom.x - kBL;
      BL_left.inY = BL_left.y + kBL;
    }
  }
  if (rr.tl > 0 && TL_left) {
    const iL = nodes.indexOf(TL_left);
    if (iL >= 0 && nodes[(iL + 1) % nodes.length] === TL_top) {
      TL_left.outY = TL_left.y - kTL;
      TL_top.inX = TL_top.x - kTL;
    }
  }

  return { v: 1, kind: 'rect', closed: true, rTL: rr.tl, rTR: rr.tr, rBR: rr.br, rBL: rr.bl, nodes };
}

export function updateRectCornerRoundness(
  data: NxEditablePathData,
  w: number,
  h: number,
  corner: 'tl' | 'tr' | 'br' | 'bl',
  nextR: number,
): NxEditablePathData {
  if (!data || data.kind !== 'rect') return data;
  const cur = {
    tl: Number((data as any).rTL || 0) || 0,
    tr: Number((data as any).rTR || 0) || 0,
    br: Number((data as any).rBR || 0) || 0,
    bl: Number((data as any).rBL || 0) || 0,
  };
  cur[corner] = Number(nextR || 0) || 0;
  return makeRectEditable(w, h, cur);
}

