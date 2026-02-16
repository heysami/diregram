import type { NxFxRamp } from '@/components/vision/tldraw/fx/nxfxTypes';

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function evalRampAtT(ramp: NxFxRamp, t: number): number {
  const tt = clamp01(t);
  const stops = Array.isArray(ramp?.stops) ? ramp.stops : [];
  if (stops.length < 2) return tt;
  if (tt <= stops[0].t) return clamp01(stops[0].v);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (tt <= b.t) {
      const span = (b.t - a.t) || 1e-6;
      const u = clamp01((tt - a.t) / span);
      return clamp01(lerp(a.v, b.v, u));
    }
  }
  return clamp01(stops[stops.length - 1].v);
}

/**
 * Map pixel (x,y) within (w,h) to a 0..1 ramp parameter along a direction.
 * angleDeg=0 means left->right, 90 means bottom->top (screen coords).
 */
export function rampTForPixel(angleDeg: number, x: number, y: number, w: number, h: number): number {
  const ang = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const dx = Math.cos(ang);
  const dy = -Math.sin(ang); // y grows downward
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const px = x - cx;
  const py = y - cy;
  const proj = px * dx + py * dy;
  // Normalize using half-diagonal projection magnitude.
  const half = Math.abs(cx * dx) + Math.abs(cy * dy) + 1e-6;
  return clamp01(0.5 + proj / (2 * half));
}

