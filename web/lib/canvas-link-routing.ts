import type { LayoutDirection } from '@/lib/layout-direction';

export type Point = { x: number; y: number };

export function cubicBezierPath(opts: { start: Point; c1: Point; c2: Point; end: Point }): string {
  const { start, c1, c2, end } = opts;
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

export function buildStandardConnectorBezier(opts: {
  start: Point;
  end: Point;
  layoutDirection: LayoutDirection;
}): { pathD: string; mid: Point } {
  const { start, end, layoutDirection } = opts;

  if (layoutDirection === 'vertical') {
    // Vertical-down tree: bend along Y.
    const cY = start.y + (end.y - start.y) / 2;
    const pathD = cubicBezierPath({
      start,
      c1: { x: start.x, y: cY },
      c2: { x: end.x, y: cY },
      end,
    });
    return { pathD, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
  }

  // Horizontal-right tree: bend along X.
  const cX = start.x + (end.x - start.x) / 2;
  const pathD = cubicBezierPath({
    start,
    c1: { x: cX, y: start.y },
    c2: { x: cX, y: end.y },
    end,
  });
  return { pathD, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

export function buildValidationConnectorBezier(opts: {
  start: Point;
  end: Point;
  childIndex: number;
  layoutDirection: LayoutDirection;
  minCurveDistance?: number;
}): { pathD: string; mid: Point } {
  const { start, end, childIndex, layoutDirection, minCurveDistance = 40 } = opts;
  const verticalDistance = Math.abs(end.y - start.y);
  const horizontalDistance = Math.abs(end.x - start.x);
  const curveDistance = Math.max(Math.min(verticalDistance, horizontalDistance) * 0.5, minCurveDistance);

  if (layoutDirection === 'vertical') {
    // Children stack L→R, so validation exits are LEFT/RIGHT.
    const c1 = {
      x: childIndex === 0 ? start.x - curveDistance : start.x + curveDistance,
      y: start.y,
    };
    const c2 = {
      x: end.x,
      y: end.y < start.y ? end.y + curveDistance : end.y - curveDistance,
    };
    const pathD = cubicBezierPath({ start, c1, c2, end });
    return { pathD, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
  }

  // Horizontal layout: validation exits are TOP/BOTTOM.
  const c1 = {
    x: start.x,
    y: childIndex === 0 ? start.y - curveDistance : start.y + curveDistance,
  };
  const c2 = {
    x: end.x < start.x ? end.x + curveDistance : end.x - curveDistance,
    y: end.y,
  };
  const pathD = cubicBezierPath({ start, c1, c2, end });
  return { pathD, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

/**
 * "Line tool" routing (custom lines + goto dashed):
 * - Horizontal layout: vertical-bezier (jump up/down), endpoints attach top/bottom.
 * - Vertical layout: horizontal-bezier (jump left/right), endpoints attach left/right.
 */
export function buildJumpBezierBetweenBoxes(opts: {
  from: { x: number; y: number; width: number; height: number };
  to: { x: number; y: number; width: number; height: number };
  layoutDirection: LayoutDirection;
  minCurveDistance?: number;
  curveFactor?: number;
}): { pathD: string; start: Point; end: Point; mid: Point } {
  const { from, to, layoutDirection, minCurveDistance = 80, curveFactor = 0.5 } = opts;

  if (layoutDirection === 'vertical') {
    const targetIsRight = to.x >= from.x;
    const start: Point = {
      x: targetIsRight ? from.x + from.width : from.x,
      y: from.y + from.height / 2,
    };

    const targetIsMoreRight = to.x > from.x;
    const end: Point = {
      x: targetIsMoreRight ? to.x : to.x + to.width,
      y: to.y + to.height / 2,
    };

    const horizontalDistance = Math.abs(end.x - start.x);
    const curveDistance = Math.max(horizontalDistance * curveFactor, minCurveDistance);

    const c1: Point = { x: targetIsRight ? start.x + curveDistance : start.x - curveDistance, y: start.y };
    const c2: Point = { x: targetIsMoreRight ? end.x - curveDistance : end.x + curveDistance, y: end.y };

    const pathD = cubicBezierPath({ start, c1, c2, end });
    return { pathD, start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
  }

  const targetIsBelow = to.y >= from.y;
  const start: Point = {
    x: from.x + from.width / 2,
    y: targetIsBelow ? from.y + from.height : from.y,
  };

  const targetIsLower = to.y > from.y;
  const end: Point = {
    x: to.x + to.width / 2,
    y: targetIsLower ? to.y : to.y + to.height,
  };

  const verticalDistance = Math.abs(end.y - start.y);
  const curveDistance = Math.max(verticalDistance * curveFactor, minCurveDistance);

  const c1: Point = { x: start.x, y: targetIsBelow ? start.y + curveDistance : start.y - curveDistance };
  const c2: Point = { x: end.x, y: targetIsLower ? end.y - curveDistance : end.y + curveDistance };

  const pathD = cubicBezierPath({ start, c1, c2, end });
  return { pathD, start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

export function buildJumpBezierToPoint(opts: {
  from: { x: number; y: number; width: number; height: number };
  to: Point;
  layoutDirection: LayoutDirection;
  minCurveDistance?: number;
  curveFactor?: number;
}): { pathD: string; start: Point; end: Point } {
  const { from, to, layoutDirection, minCurveDistance = 80, curveFactor = 0.5 } = opts;

  if (layoutDirection === 'vertical') {
    const targetIsRight = to.x >= from.x;
    const start: Point = {
      x: targetIsRight ? from.x + from.width : from.x,
      y: from.y + from.height / 2,
    };
    const end: Point = { x: to.x, y: to.y };

    const horizontalDistance = Math.abs(end.x - start.x);
    const curveDistance = Math.max(horizontalDistance * curveFactor, minCurveDistance);
    const targetIsMoreRight = to.x > from.x;

    const c1: Point = { x: targetIsRight ? start.x + curveDistance : start.x - curveDistance, y: start.y };
    const c2: Point = { x: targetIsMoreRight ? end.x - curveDistance : end.x + curveDistance, y: end.y };
    return { pathD: cubicBezierPath({ start, c1, c2, end }), start, end };
  }

  const targetIsBelow = to.y >= from.y;
  const start: Point = {
    x: from.x + from.width / 2,
    y: targetIsBelow ? from.y + from.height : from.y,
  };
  const end: Point = { x: to.x, y: to.y };

  const verticalDistance = Math.abs(end.y - start.y);
  const curveDistance = Math.max(verticalDistance * curveFactor, minCurveDistance);
  const targetIsLower = to.y > from.y;

  const c1: Point = { x: start.x, y: targetIsBelow ? start.y + curveDistance : start.y - curveDistance };
  const c2: Point = { x: end.x, y: targetIsLower ? end.y - curveDistance : end.y + curveDistance };
  return { pathD: cubicBezierPath({ start, c1, c2, end }), start, end };
}

