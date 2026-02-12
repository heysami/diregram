export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Returns the closest intersection point between the ray (from -> to) and the rectangle border.
 * Useful for routing lines "out of" a container so they don't get hidden underneath overlays.
 */
export function getExitPointOnRectBorder(rect: Rect, from: Point, to: Point): Point | null {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;

  const candidates: Array<{ t: number; x: number; y: number }> = [];

  if (Math.abs(dx) > 1e-6) {
    const tL = (left - from.x) / dx;
    const yL = from.y + tL * dy;
    if (tL > 0 && yL >= top && yL <= bottom) candidates.push({ t: tL, x: left, y: yL });

    const tR = (right - from.x) / dx;
    const yR = from.y + tR * dy;
    if (tR > 0 && yR >= top && yR <= bottom) candidates.push({ t: tR, x: right, y: yR });
  }

  if (Math.abs(dy) > 1e-6) {
    const tT = (top - from.y) / dy;
    const xT = from.x + tT * dx;
    if (tT > 0 && xT >= left && xT <= right) candidates.push({ t: tT, x: xT, y: top });

    const tB = (bottom - from.y) / dy;
    const xB = from.x + tB * dx;
    if (tB > 0 && xB >= left && xB <= right) candidates.push({ t: tB, x: xB, y: bottom });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.t - b.t);
  const hit = candidates[0];
  return { x: hit.x, y: hit.y };
}

