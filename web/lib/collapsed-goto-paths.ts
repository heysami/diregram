export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CollapsedGotoPaths = {
  /** Curved "fake" segment from the left-side incoming point into the chosen top/bottom exit. */
  bridgePath: string;
  /** Solid redirect segment from the exit point to the target (vertical-bezier logic, like the line tool). */
  redirectPath: string;
  /** Useful anchor points (debug / future features). */
  points: {
    left: { x: number; y: number };
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
};

/**
 * Build paths for a collapsed "goto" node:
 * - bridgePath: left-center -> top/bottom exit (single-bend quadratic curve, no S-shape)
 * - redirectPath: exit -> target (vertical cubic bezier like the line tool)
 */
export function buildCollapsedGotoPaths(opts: {
  source: Box;
  target: Box;
  /** Minimum curve distance used for the vertical bezier control points. Default 80. */
  minCurveDistance?: number;
  /** Multiplier for vertical distance used for curve distance. Default 0.5. */
  curveFactor?: number;
  /** Bridge control point position along X from left->start. Default 0.65. */
  bridgeCtrlT?: number;
}): CollapsedGotoPaths {
  const {
    source,
    target,
    minCurveDistance = 80,
    curveFactor = 0.5,
    bridgeCtrlT = 0.65,
  } = opts;

  const targetIsBelow = target.y >= source.y;
  const leftX = source.x;
  const leftY = source.y + source.height / 2;

  const startX = source.x + source.width / 2;
  const startY = targetIsBelow ? source.y + source.height : source.y;

  const targetIsLower = target.y > source.y;
  const endX = target.x + target.width / 2;
  const endY = targetIsLower ? target.y : target.y + target.height;

  // Vertical bezier (same semantics as the line tool / dashed goto):
  // control points extend vertically, not horizontally.
  const verticalDistance = Math.abs(endY - startY);
  const curveDistance = Math.max(verticalDistance * curveFactor, minCurveDistance);
  const c1x = startX;
  const c1y = targetIsBelow ? startY + curveDistance : startY - curveDistance;
  const c2x = endX;
  const c2y = targetIsLower ? endY - curveDistance : endY + curveDistance;

  // Bridge: quadratic bezier so it is always a single bend (no inflection / S).
  const ctrlX = leftX + (startX - leftX) * bridgeCtrlT;
  const ctrlY = leftY;

  const bridgePath = `M ${leftX} ${leftY} Q ${ctrlX} ${ctrlY}, ${startX} ${startY}`;
  const redirectPath = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;

  return {
    bridgePath,
    redirectPath,
    points: {
      left: { x: leftX, y: leftY },
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
    },
  };
}

