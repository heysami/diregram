export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CollapsedGotoPaths = {
  /**
   * Curved "fake" segment inside the collapsed goto:
   * - Horizontal layout: left-center -> top/bottom exit
   * - Vertical layout: top-center -> left/right exit
   */
  bridgePath: string;
  /**
   * Solid redirect segment from the exit point to the target:
   * - Horizontal layout: vertical-bezier logic (like the line tool)
   * - Vertical layout: horizontal-bezier logic
   */
  redirectPath: string;
  /** Useful anchor points (debug / future features). */
  points: {
    /** Entry point (left-center in horizontal layout; top-center in vertical layout). */
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
  layoutDirection?: 'horizontal' | 'vertical';
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
    layoutDirection = 'horizontal',
    minCurveDistance = 80,
    curveFactor = 0.5,
    bridgeCtrlT = 0.65,
  } = opts;

  let entryX: number;
  let entryY: number;
  let startX: number;
  let startY: number;
  let endX: number;
  let endY: number;
  let c1x: number;
  let c1y: number;
  let c2x: number;
  let c2y: number;
  let bridgeCtrlX: number;
  let bridgeCtrlY: number;

  if (layoutDirection === 'vertical') {
    // Entry is top-center (incoming from above).
    entryX = source.x + source.width / 2;
    entryY = source.y;

    // Exit left/right depending on target relative X.
    const targetIsRight = target.x >= source.x;
    startX = targetIsRight ? source.x + source.width : source.x;
    startY = source.y + source.height / 2;

    // Redirect end connects to target left/right at vertical center.
    const targetIsMoreRight = target.x > source.x;
    endX = targetIsMoreRight ? target.x : target.x + target.width;
    endY = target.y + target.height / 2;

    const horizontalDistance = Math.abs(endX - startX);
    const curveDistance = Math.max(horizontalDistance * curveFactor, minCurveDistance);

    // Horizontal bezier: control points extend along X.
    c1x = targetIsRight ? startX + curveDistance : startX - curveDistance;
    c1y = startY;
    c2x = targetIsMoreRight ? endX - curveDistance : endX + curveDistance;
    c2y = endY;

    // Bridge: quadratic bezier (single bend) from top-center -> left/right exit.
    bridgeCtrlX = entryX;
    bridgeCtrlY = entryY + (startY - entryY) * bridgeCtrlT;
  } else {
    // Entry is left-center (incoming from the left).
    entryX = source.x;
    entryY = source.y + source.height / 2;

    // Exit top/bottom depending on target relative Y.
    const targetIsBelow = target.y >= source.y;
    startX = source.x + source.width / 2;
    startY = targetIsBelow ? source.y + source.height : source.y;

    // Redirect end connects to target top/bottom at horizontal center.
    const targetIsLower = target.y > source.y;
    endX = target.x + target.width / 2;
    endY = targetIsLower ? target.y : target.y + target.height;

    const verticalDistance = Math.abs(endY - startY);
    const curveDistance = Math.max(verticalDistance * curveFactor, minCurveDistance);

    // Vertical bezier: control points extend along Y.
    c1x = startX;
    c1y = targetIsBelow ? startY + curveDistance : startY - curveDistance;
    c2x = endX;
    c2y = targetIsLower ? endY - curveDistance : endY + curveDistance;

    // Bridge: quadratic bezier (single bend) from left-center -> top/bottom exit.
    bridgeCtrlX = entryX + (startX - entryX) * bridgeCtrlT;
    bridgeCtrlY = entryY;
  }

  const bridgePath = `M ${entryX} ${entryY} Q ${bridgeCtrlX} ${bridgeCtrlY}, ${startX} ${startY}`;
  const redirectPath = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;

  return {
    bridgePath,
    redirectPath,
    points: {
      left: { x: entryX, y: entryY },
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
    },
  };
}

