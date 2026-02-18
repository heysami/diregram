'use client';

import type { ReactNode } from 'react';
import type { Editor } from 'tldraw';
import { Mat } from '@tldraw/editor';
import { readNxFxFromMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import { safeSvgId } from '@/components/vision/tldraw/paint/paintDefs';

type MaskSpec = { sourceId: string; mode: 'shape' | 'alpha'; invert: boolean; strength: number };

function svgMatrix(m: Mat): string {
  const a = Number.isFinite(m.a) ? m.a : 1;
  const b = Number.isFinite(m.b) ? m.b : 0;
  const c = Number.isFinite(m.c) ? m.c : 0;
  const d = Number.isFinite(m.d) ? m.d : 1;
  const e = Number.isFinite(m.e) ? m.e : 0;
  const f = Number.isFinite(m.f) ? m.f : 0;
  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function roundedRectPath(w: number, h: number, rtl: number, rtr: number, rbr: number, rbl: number) {
  const tl = clamp(rtl, 0, Math.min(w, h) / 2);
  const tr = clamp(rtr, 0, Math.min(w, h) / 2);
  const br = clamp(rbr, 0, Math.min(w, h) / 2);
  const bl = clamp(rbl, 0, Math.min(w, h) / 2);
  // Path with clockwise arcs
  return [
    `M ${tl},0`,
    `H ${w - tr}`,
    tr ? `A ${tr},${tr} 0 0 1 ${w},${tr}` : `L ${w},0`,
    `V ${h - br}`,
    br ? `A ${br},${br} 0 0 1 ${w - br},${h}` : `L ${w},${h}`,
    `H ${bl}`,
    bl ? `A ${bl},${bl} 0 0 1 0,${h - bl}` : `L 0,${h}`,
    `V ${tl}`,
    tl ? `A ${tl},${tl} 0 0 1 ${tl},0` : `L 0,0`,
    'Z',
  ].join(' ');
}

function readMaskSpecFromMeta(meta: any): MaskSpec | null {
  const fx = readNxFxFromMeta(meta);
  const ds = Array.isArray((fx as any)?.distortions) ? (fx as any).distortions : [];
  const m = ds.find((d: any) => d && d.kind === 'mask' && d.enabled !== false) || null;
  if (!m || typeof m.sourceId !== 'string' || !m.sourceId) return null;
  const mode = String((m as any).mode || 'alpha') === 'shape' ? 'shape' : 'alpha';
  const invert = Boolean((m as any).invert);
  const strengthRaw = Number((m as any).strength ?? 1);
  const strength = Number.isFinite(strengthRaw) ? Math.max(0, Math.min(1, strengthRaw)) : 1;
  return { sourceId: String((m as any).sourceId), mode, invert, strength };
}

function isSupportedVectorMaskSource(shape: any): boolean {
  const t = String(shape?.type || '');
  return t === 'nxrect' || t === 'nxpath';
}

/**
 * Best-effort "vector" shape mask: uses mask source geometry as an opaque silhouette.
 * Only applies when mask distortion `mode === 'shape'` and mask source is a supported Vision vector shape.
 */
export function getVectorShapeMaskDef(opts: {
  editor: Editor | null;
  targetShape: any;
  targetSid: string;
}): { defs: ReactNode; maskAttr: string } | null {
  const editor = opts.editor;
  const target = opts.targetShape;
  if (!editor || !target?.id) return null;
  const m = readMaskSpecFromMeta(target.meta);
  if (!m) return null;
  if (m.mode !== 'shape') return null; // alpha mode handled by raster proxy
  const sourceId = String(m.sourceId || '');
  if (!sourceId || sourceId === String(target.id)) return null;
  const source: any = editor.getShape(sourceId as any);
  if (!source) return null;
  if (!isSupportedVectorMaskSource(source)) return null;

  // Relative transform: maskLocal -> targetLocal
  let rel = Mat.Identity();
  try {
    const tTarget = editor.getShapePageTransform(target.id as any);
    const tMask = editor.getShapePageTransform(source.id as any);
    rel = tTarget.clone().invert().multiply(tMask);
  } catch {
    rel = Mat.Identity();
  }

  let pathD: string | null = null;
  let extraLocal = Mat.Identity();
  if (String(source.type) === 'nxrect') {
    const w = Math.max(1, Number(source.props?.w || 1));
    const h = Math.max(1, Number(source.props?.h || 1));
    const radiusUniform = Boolean(source.props?.radiusUniform);
    const r = clamp(Number(source.props?.radius ?? 0), 0, Math.min(w, h) / 2);
    const rtl = clamp(Number(source.props?.radiusTL ?? r), 0, Math.min(w, h) / 2);
    const rtr = clamp(Number(source.props?.radiusTR ?? r), 0, Math.min(w, h) / 2);
    const rbr = clamp(Number(source.props?.radiusBR ?? r), 0, Math.min(w, h) / 2);
    const rbl = clamp(Number(source.props?.radiusBL ?? r), 0, Math.min(w, h) / 2);
    pathD = roundedRectPath(w, h, radiusUniform ? r : rtl, radiusUniform ? r : rtr, radiusUniform ? r : rbr, radiusUniform ? r : rbl);
  } else if (String(source.type) === 'nxpath') {
    pathD = String(source.props?.d || '');
    const vbX = Number.isFinite(source.props?.vbX) ? Number(source.props.vbX) : 0;
    const vbY = Number.isFinite(source.props?.vbY) ? Number(source.props.vbY) : 0;
    if (vbX || vbY) extraLocal = Mat.Translate(-vbX, -vbY);
  }
  if (!pathD) return null;

  // Combine relative matrix with any extra local transform needed by the source shape (e.g. vb translate for nxpath).
  const mtx = rel.clone().multiply(extraLocal);

  const sid = safeSvgId(String(opts.targetSid || 'shape'));
  const maskId = `${sid}__maskShape__${safeSvgId(sourceId)}`;
  const strength = Math.max(0, Math.min(1, Number(m.strength ?? 1) || 0));

  // Use an SVG <mask> so we can support invert + strength consistently.
  // In shape-mode we treat the mask geometry as opaque (white/black), not its paint.
  const wT = Math.max(1, Number(target.props?.w || 1));
  const hT = Math.max(1, Number(target.props?.h || 1));
  const big = { x: -wT * 2, y: -hT * 2, w: wT * 5, h: hT * 5 };
  const invert = Boolean(m.invert);

  const defs = (
    <mask id={maskId} maskUnits="userSpaceOnUse">
      {invert ? (
        <>
          <rect x={big.x} y={big.y} width={big.w} height={big.h} fill={`rgba(255,255,255,${strength})`} />
          <path d={pathD} transform={svgMatrix(mtx)} fill="black" />
        </>
      ) : (
        <>
          <rect x={big.x} y={big.y} width={big.w} height={big.h} fill="black" />
          <path d={pathD} transform={svgMatrix(mtx)} fill={`rgba(255,255,255,${strength})`} />
        </>
      )}
    </mask>
  );

  return { defs, maskAttr: `url(#${maskId})` };
}

