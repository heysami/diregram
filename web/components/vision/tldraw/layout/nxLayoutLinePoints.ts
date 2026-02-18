'use client';

export type XY = { x: number; y: number };

function isXY(p: any): p is XY {
  return p && typeof p === 'object' && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
}

export function tryReadLinePoints(
  shape: any,
): { kind: 'array' | 'object' | 'handles' | 'startEnd'; points: Array<{ key: any; p: XY }> } | null {
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
    return {
      kind: 'startEnd',
      points: [
        { key: 'start', p: { x: Number(props.start.x), y: Number(props.start.y) } },
        { key: 'end', p: { x: Number(props.end.x), y: Number(props.end.y) } },
      ],
    };
  }
  return null;
}

export function boundsOfPoints(points: XY[]): { minX: number; minY: number; w: number; h: number } | null {
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

export function scalePointsAroundMin(points: XY[], sx: number, sy: number): XY[] {
  const b = boundsOfPoints(points);
  if (!b) return points;
  const sxx = Number.isFinite(sx) ? sx : 1;
  const syy = Number.isFinite(sy) ? sy : 1;
  return points.map((p) => ({
    x: b.minX + (p.x - b.minX) * sxx,
    y: b.minY + (p.y - b.minY) * syy,
  }));
}

export function writeLinePointsProps(shape: any, read: NonNullable<ReturnType<typeof tryReadLinePoints>>, nextPoints: XY[]): any {
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

