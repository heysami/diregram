import type { FlowNodeType } from '@/components/DimensionFlowEditor';
import type { LayoutDirection } from '@/lib/layout-direction';

export type Point = { x: number; y: number };

function getDiamondCorner(
  nodeType: FlowNodeType | undefined,
  corner: 'left' | 'right' | 'top' | 'bottom',
  x: number,
  y: number,
  width: number,
  height: number,
): Point {
  if (nodeType !== 'validation' && nodeType !== 'branch') {
    switch (corner) {
      case 'left':
        return { x, y: y + height / 2 };
      case 'right':
        return { x: x + width, y: y + height / 2 };
      case 'top':
        return { x: x + width / 2, y };
      case 'bottom':
        return { x: x + width / 2, y: y + height };
      default:
        return { x: x + width / 2, y: y + height / 2 };
    }
  }

  const centerX = x + width / 2;
  const centerY = y + height / 2;

  switch (corner) {
    case 'left':
      return { x, y: centerY };
    case 'right':
      return { x: x + width, y: centerY };
    case 'top':
      return { x: centerX, y };
    case 'bottom':
      return { x: centerX, y: y + height };
    default:
      return { x: centerX, y: centerY };
  }
}

export function getOutgoingConnectionPoint(
  nodeType: FlowNodeType | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  childIndex: number = 0,
  layoutDirection: LayoutDirection = 'horizontal',
): Point {
  if (layoutDirection === 'vertical') {
    // Vertical-down layout: default outgoing is bottom.
    if (nodeType === 'validation') {
      // Validation: split Yes/No horizontally (left/right) when children stack left→right.
      return childIndex === 0
        ? getDiamondCorner(nodeType, 'left', x, y, width, height)
        : getDiamondCorner(nodeType, 'right', x, y, width, height);
    }
    if (nodeType === 'branch') {
      return getDiamondCorner(nodeType, 'bottom', x, y, width, height);
    }
    return getDiamondCorner(nodeType, 'bottom', x, y, width, height);
  }

  if (nodeType === 'validation') {
    return childIndex === 0
      ? getDiamondCorner(nodeType, 'top', x, y, width, height)
      : getDiamondCorner(nodeType, 'bottom', x, y, width, height);
  }

  if (nodeType === 'branch') {
    return getDiamondCorner(nodeType, 'right', x, y, width, height);
  }

  return getDiamondCorner(nodeType, 'right', x, y, width, height);
}

export function getIncomingConnectionPoint(
  nodeType: FlowNodeType | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  layoutDirection: LayoutDirection = 'horizontal',
): Point {
  if (layoutDirection === 'vertical') {
    // Vertical-down layout: default incoming is top.
    if (nodeType === 'validation' || nodeType === 'branch') {
      return getDiamondCorner(nodeType, 'top', x, y, width, height);
    }
    return getDiamondCorner(nodeType, 'top', x, y, width, height);
  }

  if (nodeType === 'validation' || nodeType === 'branch') {
    return getDiamondCorner(nodeType, 'left', x, y, width, height);
  }

  return getDiamondCorner(nodeType, 'left', x, y, width, height);
}

