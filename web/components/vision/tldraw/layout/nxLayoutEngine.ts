'use client';

import type { Editor } from 'tldraw';
import { getShapePageBounds } from '@/components/vision/tldraw/fx/proxy/proxyBounds';
import { readNxConstraints, readNxLayoutChildMeta } from './nxLayoutMeta';
import { asNum, clamp, getChildIds, isNxLayout, safeGetShape } from './nxLayoutUtils';
import { boundsOfPoints, scalePointsAroundMin, tryReadLinePoints, type XY, writeLinePointsProps } from './nxLayoutLinePoints';

export type NxLayoutSizeOverride = { w?: number; h?: number; linePoints?: XY[] };

export function getChildSize(editor: Editor, shape: any, ov?: NxLayoutSizeOverride | null): { w: number; h: number } {
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

export function applyAutoLayout(
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
    effectiveSizeX !== sizeX || effectiveSizeY !== sizeY ? { sizeX: effectiveSizeX, sizeY: effectiveSizeY } : null;

  const effectiveAlignCross = alignCross;

  const sizes = children.map((s) => getChildSize(editor, s, sizeOverrides?.get(String(s.id)) || null));
  const mainSizes = sizes.map((sz) => (direction === 'horizontal' ? sz.w : sz.h));
  const crossSizes = sizes.map((sz) => (direction === 'horizontal' ? sz.h : sz.w));

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
  const fillCount = children.reduce((acc, _s, i) => {
    const m = childMeta[i];
    const axisMode = direction === 'horizontal' ? m.sizeX : m.sizeY;
    const containerAxisSizeMode = direction === 'horizontal' ? effectiveSizeX : effectiveSizeY;
    if (axisMode === 'fill' && containerAxisSizeMode === 'fixed') return acc + 1;
    return acc;
  }, 0);
  const fixedMainSum = children.reduce((acc, _s, i) => {
    const m = childMeta[i];
    const axisMode = direction === 'horizontal' ? m.sizeX : m.sizeY;
    const containerAxisSizeMode = direction === 'horizontal' ? effectiveSizeX : effectiveSizeY;
    if (axisMode === 'fill' && containerAxisSizeMode === 'fixed') return acc;
    return acc + Math.max(0, mainSizes[i]);
  }, 0);
  const perFill = fillCount > 0 ? Math.max(0, (availableMain - fixedMainSum) / fillCount) : 0;

  const nextMainSizes = children.map((_s, i) => {
    const m = childMeta[i];
    const axisMode = direction === 'horizontal' ? m.sizeX : m.sizeY;
    const containerAxisSizeMode = direction === 'horizontal' ? effectiveSizeX : effectiveSizeY;
    if (axisMode === 'fill' && containerAxisSizeMode === 'fixed') return perFill;
    return Math.max(1, mainSizes[i]);
  });

  // Compute cross axis sizes
  const nextCrossSizes = children.map((_s, i) => {
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

export function applyManualConstraints(editor: Editor, from: any, to: any, childFromById?: Map<string, any> | null): any[] {
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

    const snap = (childFromById && childFromById.get(String(child.id))) || null;
    const base = snap || child;
    const cons = readNxConstraints((base as any).meta ?? child.meta);
    const x0 = asNum((base as any).x, 0);
    const y0 = asNum((base as any).y, 0);
    const cw0 = asNum((base as any)?.props?.w, NaN);
    const ch0 = asNum((base as any)?.props?.h, NaN);

    let x = x0;
    let y = y0;
    let cw = cw0;
    let ch = ch0;

    const isLine = String(child.type || '') === 'line';
    const lineRead = isLine ? tryReadLinePoints(base) : null;
    const linePts = lineRead ? lineRead.points.map((pp) => pp.p) : null;
    const lineB = linePts ? boundsOfPoints(linePts) : null;

    const leftBound0 = lineB ? x0 + lineB.minX : x0;
    const topBound0 = lineB ? y0 + lineB.minY : y0;

    // Horizontal
    let desiredWForLine: number | null = null;
    {
      const w0 = Number.isFinite(cw0) ? Math.max(1, cw0) : getChildSize(editor, base, null).w;
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
      const h0 = Number.isFinite(ch0) ? Math.max(1, ch0) : getChildSize(editor, base, null).h;
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

