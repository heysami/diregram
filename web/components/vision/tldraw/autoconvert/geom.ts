'use client';

export type Pt = { x: number; y: number };

export function pt(x: unknown, y: unknown): Pt {
  return { x: Number(x) || 0, y: Number(y) || 0 };
}

export function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(a: Pt, k: number): Pt {
  return { x: a.x * k, y: a.y * k };
}

export function len(a: Pt): number {
  return Math.hypot(a.x, a.y);
}

export function norm(a: Pt): Pt {
  const l = len(a);
  return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
}

export function perp(a: Pt): Pt {
  return { x: -a.y, y: a.x };
}

export function boundsOf(points: Pt[]) {
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
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

export function ellipsePath(w: number, h: number) {
  const rx = Math.max(0.5, w / 2);
  const ry = Math.max(0.5, h / 2);
  const cx = rx;
  const cy = ry;
  // Two-arc ellipse path.
  return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry} Z`;
}

