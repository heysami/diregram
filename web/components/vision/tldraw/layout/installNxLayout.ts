'use client';

import type { Editor } from 'tldraw';
import { type TLShapeId } from '@tldraw/tlschema';
import { isShapeRecordId } from '@/components/vision/tldraw/autoconvert/shapePredicates';
import { getShapePageBounds } from '@/components/vision/tldraw/fx/proxy/proxyBounds';
import { NX_LAYOUT_CHILD_META_KEY, NX_LAYOUT_CONSTRAINTS_META_KEY, readNxConstraints, readNxLayoutChildMeta } from './nxLayoutMeta';
import { applyAutoLayout as engineApplyAutoLayout, applyManualConstraints as engineApplyManualConstraints } from './nxLayoutEngine';
import {
  enforceAutoLayoutDuringResize,
  enforceManualConstraintsDuringResize,
  finalizeManualConstraintsAfterResize,
  tickManualConstraintsWhileResizing,
} from './nxLayoutResizeEnforcement';
import { getParentShapeId as utilGetParentShapeId, isNxLayout as utilIsNxLayout, safeGetShape as utilSafeGetShape } from './nxLayoutUtils';

function asNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function isNxLayout(shape: any): boolean {
  return Boolean(shape && typeof shape === 'object' && String(shape.type || '') === 'nxlayout');
}

function nxLayoutDebugEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window?.localStorage?.getItem('nxlayoutDebug') === '1';
  } catch {
    return false;
  }
}

function nxLayoutDebugLog(...args: any[]) {
  if (!nxLayoutDebugEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.debug('[nxlayout]', ...args);
  } catch {
    // ignore
  }
}

function getParentShapeId(parentId: any): TLShapeId | null {
  const s = String(parentId || '');
  return s.startsWith('shape:') ? (s.slice('shape:'.length) as TLShapeId) : null;
}

function getChildIds(editor: Editor, parentId: TLShapeId): TLShapeId[] {
  try {
    return ((editor as any).getSortedChildIdsForParent?.(parentId as any) || []).filter(Boolean);
  } catch {
    return [];
  }
}

type NxLayoutSizeOverride = { w?: number; h?: number; linePoints?: XY[] };

function getChildSize(editor: Editor, shape: any, ov?: NxLayoutSizeOverride | null): { w: number; h: number } {
  if (ov && Number.isFinite(Number(ov.w)) && Number.isFinite(Number(ov.h)) && Number(ov.w) > 0 && Number(ov.h) > 0) {
    return { w: Math.max(1, Number(ov.w)), h: Math.max(1, Number(ov.h)) };
  }
  if (ov?.linePoints && ov.linePoints.length >= 2) {
    const b = boundsOfPoints(ov.linePoints);
    if (b) return { w: Math.max(1, b.w), h: Math.max(1, b.h) };
  }
  const pw = asNum(shape?.props?.w, NaN);
  const ph = asNum(shape?.props?.h, NaN);
  if (Number.isFinite(pw) && Number.isFinite(ph) && pw > 0 && ph > 0) return { w: pw, h: ph };
  const b = getShapePageBounds(editor, shape?.id as any);
  if (b) return { w: Math.max(1, b.w), h: Math.max(1, b.h) };
  return { w: 1, h: 1 };
}

function safeGetShape(editor: Editor, id: TLShapeId): any | null {
  const raw = String(id || '');
  const candidates = raw
    ? raw.startsWith('shape:')
      ? [raw, raw.slice('shape:'.length)]
      : [raw, `shape:${raw}`]
    : [];
  for (const cand of candidates) {
    try {
      const s = (editor as any).getShape?.(cand as any) || null;
      if (s) return s;
    } catch {
      // ignore
    }
  }
  return null;
}

type XY = { x: number; y: number };

function isXY(p: any): p is XY {
  return p && typeof p === 'object' && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
}

function tryReadLinePoints(shape: any): { kind: 'array' | 'object' | 'handles' | 'startEnd'; points: Array<{ key: any; p: XY }> } | null {
  if (!shape || typeof shape !== 'object') return null;
  const props: any = shape.props || {};

  // Common patterns for line-like shapes across versions:
  // - props.points: XY[]
  // - props.points: Record<string, XY>
  // - props.handles: Record<string, { x, y, ... }>
  // - props.start / props.end: XY
  if (Array.isArray(props.points) && props.points.every(isXY)) {
    return { kind: 'array', points: props.points.map((p: any, i: number) => ({ key: i, p: { x: Number(p.x), y: Number(p.y) } })) };
  }
  if (props.points && typeof props.points === 'object' && !Array.isArray(props.points)) {
    const entries = Object.entries<any>(props.points).filter(([, v]) => isXY(v));
    if (entries.length >= 2) {
      return { kind: 'object', points: entries.map(([k, v]) => ({ key: k, p: { x: Number(v.x), y: Number(v.y) } })) };
    }
  }
  if (props.handles && typeof props.handles === 'object') {
    const entries = Object.entries<any>(props.handles).filter(([, v]) => isXY(v));
    if (entries.length >= 2) {
      return { kind: 'handles', points: entries.map(([k, v]) => ({ key: k, p: { x: Number(v.x), y: Number(v.y) } })) };
    }
  }
  if (isXY(props.start) && isXY(props.end)) {
    return { kind: 'startEnd', points: [{ key: 'start', p: { x: Number(props.start.x), y: Number(props.start.y) } }, { key: 'end', p: { x: Number(props.end.x), y: Number(props.end.y) } }] };
  }
  return null;
}

function boundsOfPoints(points: XY[]): { minX: number; minY: number; w: number; h: number } | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { minX, minY, w, h };
}

function scalePointsAroundMin(points: XY[], sx: number, sy: number): XY[] {
  const b = boundsOfPoints(points);
  if (!b) return points;
  const sxx = Number.isFinite(sx) ? sx : 1;
  const syy = Number.isFinite(sy) ? sy : 1;
  return points.map((p) => ({
    x: b.minX + (p.x - b.minX) * sxx,
    y: b.minY + (p.y - b.minY) * syy,
  }));
}

function writeLinePointsProps(shape: any, read: NonNullable<ReturnType<typeof tryReadLinePoints>>, nextPoints: XY[]): any {
  const props: any = shape.props || {};
  if (read.kind === 'array') {
    return { ...props, points: nextPoints.map((p) => ({ x: p.x, y: p.y })) };
  }
  if (read.kind === 'object') {
    const next: any = { ...(props.points || {}) };
    for (let i = 0; i < read.points.length; i++) {
      const key = read.points[i].key;
      const p = nextPoints[i] || read.points[i].p;
      next[key] = { ...(next[key] || {}), x: p.x, y: p.y };
    }
    return { ...props, points: next };
  }
  if (read.kind === 'handles') {
    const next: any = { ...(props.handles || {}) };
    for (let i = 0; i < read.points.length; i++) {
      const key = read.points[i].key;
      const p = nextPoints[i] || read.points[i].p;
      next[key] = { ...(next[key] || {}), x: p.x, y: p.y };
    }
    return { ...props, handles: next };
  }
  if (read.kind === 'startEnd') {
    const p0 = nextPoints[0] || read.points[0].p;
    const p1 = nextPoints[1] || read.points[1].p;
    return { ...props, start: { ...(props.start || {}), x: p0.x, y: p0.y }, end: { ...(props.end || {}), x: p1.x, y: p1.y } };
  }
  return props;
}

function computeHugSize({
  direction,
  paddingLeft,
  paddingRight,
  paddingTop,
  paddingBottom,
  gap,
  children,
}: {
  direction: 'horizontal' | 'vertical';
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  gap: number;
  children: Array<{ w: number; h: number }>;
}): { w: number; h: number } {
  const n = children.length;
  const gaps = Math.max(0, n - 1) * Math.max(0, gap);
  if (direction === 'horizontal') {
    const main = children.reduce((acc, c) => acc + Math.max(0, c.w), 0);
    const cross = children.reduce((acc, c) => Math.max(acc, Math.max(0, c.h)), 0);
    return {
      w: Math.max(1, paddingLeft + main + gaps + paddingRight),
      h: Math.max(1, paddingTop + cross + paddingBottom),
    };
  } else {
    const main = children.reduce((acc, c) => acc + Math.max(0, c.h), 0);
    const cross = children.reduce((acc, c) => Math.max(acc, Math.max(0, c.w)), 0);
    return {
      w: Math.max(1, paddingLeft + cross + paddingRight),
      h: Math.max(1, paddingTop + main + gaps + paddingBottom),
    };
  }
}

function applyAutoLayout(
  editor: Editor,
  container: any,
  sizeOverrides?: Map<string, NxLayoutSizeOverride> | null,
): { shapeUpdates: any[]; containerPatch: any | null } {
  const w = Math.max(1, asNum(container?.props?.w, 1));
  const h = Math.max(1, asNum(container?.props?.h, 1));
  const direction = (String(container?.props?.direction || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical') as 'horizontal' | 'vertical';
  const gap = clamp(asNum(container?.props?.gap, 0), 0, 4096);
  const paddingTop = clamp(asNum(container?.props?.paddingTop, 0), 0, 4096);
  const paddingRight = clamp(asNum(container?.props?.paddingRight, 0), 0, 4096);
  const paddingBottom = clamp(asNum(container?.props?.paddingBottom, 0), 0, 4096);
  const paddingLeft = clamp(asNum(container?.props?.paddingLeft, 0), 0, 4096);
  const alignCrossRaw = String(container?.props?.alignCross || 'start');
  const alignCross = (alignCrossRaw === 'center' || alignCrossRaw === 'end' ? alignCrossRaw : 'start') as 'start' | 'center' | 'end';
  const sizeX = String(container?.props?.sizeX || 'fixed') === 'hug' ? 'hug' : 'fixed';
  const sizeY = String(container?.props?.sizeY || 'fixed') === 'hug' ? 'hug' : 'fixed';

  const childIds = getChildIds(editor, container.id as any);
  const children: any[] = [];
  for (const id of childIds) {
    const s = safeGetShape(editor, id);
    if (!s) continue;
    if (s.isLocked) continue;
    // Skip hidden descendants (used by FX/booleans) from participating in layout.
    if (s.meta?.nxHidden) continue;
    children.push(s);
  }

  const childMeta = children.map((s) => readNxLayoutChildMeta(s.meta));

  // Conflict prevention: container hug cannot coexist with any fill child on that axis.
  const anyFillX = childMeta.some((m) => m.sizeX === 'fill');
  const anyFillY = childMeta.some((m) => m.sizeY === 'fill');
  const canHugX = !anyFillX;
  const canHugY = !anyFillY;

  const effectiveSizeX = sizeX === 'hug' && canHugX ? 'hug' : 'fixed';
  const effectiveSizeY = sizeY === 'hug' && canHugY ? 'hug' : 'fixed';
  const containerPatch: any =
    effectiveSizeX !== sizeX || effectiveSizeY !== sizeY
      ? { sizeX: effectiveSizeX, sizeY: effectiveSizeY }
      : null;

  const effectiveAlignCross = alignCross;

  const sizes = children.map((s) => getChildSize(editor, s, sizeOverrides?.get(String(s.id)) || null));
  const mainSizes = sizes.map((sz, i) => (direction === 'horizontal' ? sz.w : sz.h));
  const crossSizes = sizes.map((sz, i) => (direction === 'horizontal' ? sz.h : sz.w));

  const padMainStart = direction === 'horizontal' ? paddingLeft : paddingTop;
  const padMainEnd = direction === 'horizontal' ? paddingRight : paddingBottom;
  const padCrossStart = direction === 'horizontal' ? paddingTop : paddingLeft;
  const padCrossEnd = direction === 'horizontal' ? paddingBottom : paddingRight;
  const containerMain = direction === 'horizontal' ? w : h;
  const containerCross = direction === 'horizontal' ? h : w;

  const n = children.length;
  const totalGap = Math.max(0, n - 1) * gap;
  const availableMain = Math.max(0, containerMain - padMainStart - padMainEnd - totalGap);
  const availableCross = Math.max(0, containerCross - padCrossStart - padCrossEnd);

  // Compute main axis sizes
  const fillCount = children.reduce((acc, s, i) => {
    const m = childMeta[i];
    const axisMode = direction === 'horizontal' ? m.sizeX : m.sizeY;
    const containerAxisSizeMode = direction === 'horizontal' ? effectiveSizeX : effectiveSizeY;
    if (axisMode === 'fill' && containerAxisSizeMode === 'fixed') return acc + 1;
    return acc;
  }, 0);
  const fixedMainSum = children.reduce((acc, s, i) => {
    const m = childMeta[i];
    const axisMode = direction === 'horizontal' ? m.sizeX : m.sizeY;
    const containerAxisSizeMode = direction === 'horizontal' ? effectiveSizeX : effectiveSizeY;
    if (axisMode === 'fill' && containerAxisSizeMode === 'fixed') return acc;
    return acc + Math.max(0, mainSizes[i]);
  }, 0);
  const perFill = fillCount > 0 ? Math.max(0, (availableMain - fixedMainSum) / fillCount) : 0;

  const nextMainSizes = children.map((s, i) => {
    const m = childMeta[i];
    const axisMode = direction === 'horizontal' ? m.sizeX : m.sizeY;
    const containerAxisSizeMode = direction === 'horizontal' ? effectiveSizeX : effectiveSizeY;
    if (axisMode === 'fill' && containerAxisSizeMode === 'fixed') return perFill;
    return Math.max(1, mainSizes[i]);
  });

  // Compute cross axis sizes
  const nextCrossSizes = children.map((s, i) => {
    const m = childMeta[i];
    const axisMode = direction === 'horizontal' ? m.sizeY : m.sizeX;
    const containerAxisSizeMode = direction === 'horizontal' ? effectiveSizeY : effectiveSizeX;
    const stretch = axisMode === 'fill';
    if (stretch && containerAxisSizeMode === 'fixed') return Math.max(1, availableCross);
    return Math.max(1, crossSizes[i]);
  });

  const shapeUpdates: any[] = [];

  let cursor = padMainStart;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const meta = childMeta[i];
    const main = nextMainSizes[i];
    const cross = nextCrossSizes[i];

    // Cross alignment
    const alignSelf = effectiveAlignCross as any;
    let crossPos = padCrossStart;
    if (alignSelf === 'center') crossPos = padCrossStart + (availableCross - cross) / 2;
    else if (alignSelf === 'end') crossPos = containerCross - padCrossEnd - cross;
    else crossPos = padCrossStart;

    const nextX = direction === 'horizontal' ? cursor : crossPos;
    const nextY = direction === 'horizontal' ? crossPos : cursor;

    const nextW = direction === 'horizontal' ? main : cross;
    const nextH = direction === 'horizontal' ? cross : main;

    const patch: any = { id: child.id, type: child.type, x: nextX, y: nextY };

    // Only update w/h for shapes that support it.
    const cw = asNum(child?.props?.w, NaN);
    const ch = asNum(child?.props?.h, NaN);
    if (Number.isFinite(cw) && Number.isFinite(ch)) {
      patch.props = { ...(child.props || {}), w: Math.max(1, nextW), h: Math.max(1, nextH) };
    } else if (String(child.type || '') === 'line') {
      // Scale endpoints for lines to match desired bounds.
      const read = tryReadLinePoints(child);
      if (read) {
        const pts = read.points.map((pp) => pp.p);
        const b = boundsOfPoints(pts);
        if (b) {
          const sx = Math.max(1e-6, nextW) / Math.max(1e-6, b.w);
          const sy = Math.max(1e-6, nextH) / Math.max(1e-6, b.h);
          const nextPts = scalePointsAroundMin(pts, sx, sy);
          patch.props = writeLinePointsProps(child, read, nextPts);
          // Keep the line's min bounds aligned to layout position.
          patch.x = nextX - b.minX;
          patch.y = nextY - b.minY;
        }
      }
    }

    shapeUpdates.push(patch);
    cursor += main + gap;
  }

  // Hug sizing (after sizing children)
  let finalContainerPatch: any = containerPatch ? { ...containerPatch } : null;
  if (effectiveSizeX === 'hug' || effectiveSizeY === 'hug') {
    const childDims = children.map((_, i) => {
      const ww = direction === 'horizontal' ? nextMainSizes[i] : nextCrossSizes[i];
      const hh = direction === 'horizontal' ? nextCrossSizes[i] : nextMainSizes[i];
      return { w: ww, h: hh };
    });
    const hug = computeHugSize({
      direction,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      gap,
      children: childDims,
    });
    const nextW = effectiveSizeX === 'hug' ? hug.w : w;
    const nextH = effectiveSizeY === 'hug' ? hug.h : h;
    if (!finalContainerPatch) finalContainerPatch = {};
    if (effectiveSizeX === 'hug') finalContainerPatch.w = nextW;
    if (effectiveSizeY === 'hug') finalContainerPatch.h = nextH;
  }

  return { shapeUpdates, containerPatch: finalContainerPatch };
}

function applyManualConstraints(editor: Editor, from: any, to: any): any[] {
  if (!isNxLayout(to)) return [];
  const layoutMode = String(to?.props?.layoutMode || 'manual');
  if (layoutMode !== 'manual') return [];

  const oldW = Math.max(1, asNum(from?.props?.w, 1));
  const oldH = Math.max(1, asNum(from?.props?.h, 1));
  const newW = Math.max(1, asNum(to?.props?.w, oldW));
  const newH = Math.max(1, asNum(to?.props?.h, oldH));

  // Only respond to size changes (ignore pure moves).
  if (oldW === newW && oldH === newH) return [];

  const childIds = getChildIds(editor, to.id as any);
  const updates: any[] = [];
  for (const id of childIds) {
    const child = safeGetShape(editor, id);
    if (!child) continue;
    if (child.isLocked) continue;
    if (child.meta?.nxHidden) continue;

    const cons = readNxConstraints(child.meta);
    const x0 = asNum(child.x, 0);
    const y0 = asNum(child.y, 0);
    const cw0 = asNum(child?.props?.w, NaN);
    const ch0 = asNum(child?.props?.h, NaN);

    let x = x0;
    let y = y0;
    let cw = cw0;
    let ch = ch0;

    const isLine = String(child.type || '') === 'line';
    const lineRead = isLine ? tryReadLinePoints(child) : null;
    const linePts = lineRead ? lineRead.points.map((pp) => pp.p) : null;
    const lineB = linePts ? boundsOfPoints(linePts) : null;

    const leftBound0 = lineB ? x0 + lineB.minX : x0;
    const topBound0 = lineB ? y0 + lineB.minY : y0;

    // Horizontal
    let desiredWForLine: number | null = null;
    {
      const w0 = Number.isFinite(cw0) ? Math.max(1, cw0) : getChildSize(editor, child, null).w;
      const L = leftBound0;
      const R = oldW - (leftBound0 + w0);
      const C = leftBound0 + w0 / 2 - oldW / 2;
      const mode = cons.h;
      if (mode === 'left') {
        x = L;
        desiredWForLine = w0;
      } else if (mode === 'right') {
        x = newW - R - w0;
        desiredWForLine = w0;
      } else if (mode === 'leftRight') {
        x = L;
        const nextW = Math.max(1, newW - L - R);
        desiredWForLine = nextW;
        if (Number.isFinite(cw0)) cw = nextW;
      } else if (mode === 'center') {
        x = newW / 2 + C - w0 / 2;
        desiredWForLine = w0;
      }
    }

    // Vertical
    let desiredHForLine: number | null = null;
    {
      const h0 = Number.isFinite(ch0) ? Math.max(1, ch0) : getChildSize(editor, child, null).h;
      const T = topBound0;
      const B = oldH - (topBound0 + h0);
      const C = topBound0 + h0 / 2 - oldH / 2;
      const mode = cons.v;
      if (mode === 'top') {
        y = T;
        desiredHForLine = h0;
      } else if (mode === 'bottom') {
        y = newH - B - h0;
        desiredHForLine = h0;
      } else if (mode === 'topBottom') {
        y = T;
        const nextH = Math.max(1, newH - T - B);
        desiredHForLine = nextH;
        if (Number.isFinite(ch0)) ch = nextH;
      } else if (mode === 'center') {
        y = newH / 2 + C - h0 / 2;
        desiredHForLine = h0;
      }
    }

    const patch: any = { id: child.id, type: child.type, x, y };
    if (Number.isFinite(cw) && Number.isFinite(ch)) {
      patch.props = { ...(child.props || {}), w: cw, h: ch };
    } else if (isLine && lineRead && lineB) {
      // Scale line endpoints to match implied stretched size.
      const desiredW = Math.max(1e-6, desiredWForLine ?? lineB.w);
      const desiredH = Math.max(1e-6, desiredHForLine ?? lineB.h);
      const sx = desiredW / Math.max(1e-6, lineB.w);
      const sy = desiredH / Math.max(1e-6, lineB.h);
      const nextPts = scalePointsAroundMin(linePts || [], sx, sy);
      patch.props = writeLinePointsProps(child, lineRead, nextPts);
      patch.x = (x as number) - lineB.minX;
      patch.y = (y as number) - lineB.minY;
    }
    updates.push(patch);
  }
  return updates;
}

export function installNxLayout(editor: Editor): () => void {
  let enabled = false;
  let mutating = false;

  const dirty = new Set<string>();
  const dirtyAfterResize = new Set<string>();
  let raf: number | null = null;
  let finalizeRaf: number | null = null;
  let finalizeTimer: number | null = null;

  const enableTimer = window.setTimeout(() => {
    enabled = true;
  }, 0);

  const scheduleFinalizeManualConstraints = () => {
    // Ensure we run after tldraw's internal pointerup / selection transitions.
    // We want to be the "last writer" that re-asserts manual constraints.
    if (finalizeRaf) window.cancelAnimationFrame(finalizeRaf);
    if (finalizeTimer) window.clearTimeout(finalizeTimer);
    finalizeRaf = window.requestAnimationFrame(() => {
      finalizeRaf = null;
      finalizeTimer = window.setTimeout(() => {
        finalizeTimer = null;
        const run = () => {
          try {
            finalizeManualConstraintsAfterResize({
              editor,
              setMutating: (next) => {
                mutating = next;
              },
            });
          } catch {
            // ignore
          }
        };
        // Run twice to better survive edge-case ordering where the first attempt happens
        // before tldraw has flipped out of its internal resize state.
        run();
        window.setTimeout(run, 0);
      }, 0);
    });
  };

  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = null;
      if (mutating) return;
      if (!dirty.size) return;

      const ids = Array.from(dirty);
      dirty.clear();

      const shapeUpdates: any[] = [];
      const containerUpdates: any[] = [];

      mutating = true;
      try {
        for (const id of ids) {
          const s = utilSafeGetShape(editor, id as any);
          if (!s || !utilIsNxLayout(s)) continue;
          const mode = String(s?.props?.layoutMode || 'manual');
          if (mode !== 'auto') continue;
          const { shapeUpdates: su, containerPatch } = engineApplyAutoLayout(editor, s);
          shapeUpdates.push(...su);
          if (containerPatch && Object.keys(containerPatch).length) {
            containerUpdates.push({ id: s.id, type: s.type, props: { ...(s.props || {}), ...containerPatch } });
          }
        }

        if (shapeUpdates.length) editor.updateShapes(shapeUpdates as any);
        if (containerUpdates.length) editor.updateShapes(containerUpdates as any);
      } catch {
        // ignore
      } finally {
        // Let store events settle.
        window.setTimeout(() => {
          mutating = false;
        }, 0);
      }
    });
  };

  const cleanup = editor.store.listen(
    (entry: any) => {
      if (!enabled) return;

      let isResizingNow = false;
      try {
        isResizingNow = Boolean((editor as any).isInAny?.('select.resizing'));
      } catch {
        isResizingNow = false;
      }

      if (
        enforceManualConstraintsDuringResize({
          editor,
          entry,
          mutating,
          setMutating: (next) => {
            mutating = next;
          },
        })
      ) {
        return;
      }

      if (
        enforceAutoLayoutDuringResize({
          editor,
          entry,
          mutating,
          setMutating: (next) => {
            mutating = next;
          },
        })
      ) {
        return;
      }

      if (mutating) return;

      const added = entry?.changes?.added || {};
      const updated = entry?.changes?.updated || {};

      // Manual constraints: respond directly to container size deltas.
      if (!isResizingNow) {
        const constraintUpdates: any[] = [];
        for (const [rid, pair] of Object.entries<any>(updated)) {
          if (!isShapeRecordId(String(rid))) continue;
          const from = Array.isArray(pair) ? pair[0] : null;
          const to = Array.isArray(pair) ? pair[1] : null;
          if (!from || !to) continue;
          if (!utilIsNxLayout(to)) continue;
          constraintUpdates.push(...engineApplyManualConstraints(editor, from, to));
        }
        if (constraintUpdates.length) {
          mutating = true;
          try {
            editor.updateShapes(constraintUpdates as any);
          } catch {
            // ignore
          } finally {
            window.requestAnimationFrame(() => {
              mutating = false;
            });
          }
        }
      }

      // Auto-layout: mark dirty containers when containers/children change.
      const markDirty = (shapeId: string) => {
        if (!shapeId) return;
        // Avoid fighting interactive resizing: defer refresh until pointerup.
        if (isResizingNow) dirtyAfterResize.add(String(shapeId));
        else dirty.add(String(shapeId));
      };

      for (const [rid, rec] of Object.entries<any>(added)) {
        if (!isShapeRecordId(String(rid))) continue;
        if (!rec) continue;
        if (utilIsNxLayout(rec)) markDirty(String(rec.id || rid));

        const pid = utilGetParentShapeId(rec.parentId);
        if (pid) {
          const parent = utilSafeGetShape(editor, pid);
          if (utilIsNxLayout(parent)) markDirty(String(parent.id));
        }
      }

      for (const [rid, pair] of Object.entries<any>(updated)) {
        if (!isShapeRecordId(String(rid))) continue;
        const from = Array.isArray(pair) ? pair[0] : null;
        const to = Array.isArray(pair) ? pair[1] : null;
        if (!to) continue;

        if (utilIsNxLayout(to)) {
          markDirty(String(to.id || rid));
        } else {
          const pid = utilGetParentShapeId(to.parentId);
          if (pid) {
            const parent = utilSafeGetShape(editor, pid);
            if (utilIsNxLayout(parent)) markDirty(String(parent.id));
          }
          const prevPid = from ? utilGetParentShapeId(from.parentId) : null;
          if (prevPid && prevPid !== pid) {
            const prevParent = utilSafeGetShape(editor, prevPid);
            if (utilIsNxLayout(prevParent)) markDirty(String(prevParent.id));
          }
        }

        // If the child metadata changed, re-layout its parent.
        try {
          const fm = from?.meta || {};
          const tm = to?.meta || {};
          if (
            JSON.stringify(fm?.[NX_LAYOUT_CHILD_META_KEY]) !== JSON.stringify(tm?.[NX_LAYOUT_CHILD_META_KEY]) ||
            JSON.stringify(fm?.[NX_LAYOUT_CONSTRAINTS_META_KEY]) !== JSON.stringify(tm?.[NX_LAYOUT_CONSTRAINTS_META_KEY])
          ) {
            const pid = utilGetParentShapeId(to.parentId);
            if (pid) {
              const parent = utilSafeGetShape(editor, pid);
              if (utilIsNxLayout(parent)) markDirty(String(parent.id));
            }
          }
        } catch {
          // ignore
        }
      }

      if (!isResizingNow && dirty.size) schedule();
    },
    { scope: 'document' as any },
  );

  // Stronger override: run after pointermove while resizing.
  const onPointerMove = () => {
    if (!enabled) return;
    tickManualConstraintsWhileResizing({
      editor,
      setMutating: (next) => {
        mutating = next;
      },
    });
  };
  window.addEventListener('pointermove', onPointerMove, { capture: false });
  const onPointerUp = () => {
    if (!enabled) return;
    scheduleFinalizeManualConstraints();

    // Auto-layout: if changes happened during an interactive resize, refresh once at the end.
    if (dirtyAfterResize.size) {
      for (const id of Array.from(dirtyAfterResize)) dirty.add(id);
      dirtyAfterResize.clear();
      schedule();
    }
  };
  const UP_CAPTURE: AddEventListenerOptions = { capture: true };
  window.addEventListener('pointerup', onPointerUp, UP_CAPTURE);
  window.addEventListener('pointercancel', onPointerUp, UP_CAPTURE);

  return () => {
    window.clearTimeout(enableTimer);
    if (raf) window.cancelAnimationFrame(raf);
    raf = null;
    if (finalizeRaf) window.cancelAnimationFrame(finalizeRaf);
    finalizeRaf = null;
    if (finalizeTimer) window.clearTimeout(finalizeTimer);
    finalizeTimer = null;
    dirty.clear();
    try {
      cleanup?.();
    } catch {
      // ignore
    }
    try {
      window.removeEventListener('pointermove', onPointerMove as any, { capture: false } as any);
    } catch {
      // ignore
    }
    try {
      window.removeEventListener('pointerup', onPointerUp as any, UP_CAPTURE as any);
    } catch {
      // ignore
    }
    try {
      window.removeEventListener('pointercancel', onPointerUp as any, UP_CAPTURE as any);
    } catch {
      // ignore
    }
  };
}

