import { NexusNode } from '@/types/nexus';
import type { NodeLayout } from './layout-engine';

/**
 * Centralized constants + helpers for diamond-shaped process-flow nodes.
 *
 * Keeping this in `web/lib/` (not in components) prevents accidental coupling
 * to UI code and makes it less likely future layout refactors break these rules.
 */
export const DIAMOND_SIZE = 120;

export function isProcessFlowDiamondType(nodeType?: string | null): boolean {
  return nodeType === 'validation' || nodeType === 'branch';
}

/**
 * Diamond nodes are drawn with their `layout.y` representing the **top corner**
 * (not the top-left bounding box). To keep the diamond closer to its incoming edge,
 * we start laying out its children slightly higher.
 */
export function getDiamondChildStartY(opts: {
  startY: number;
  topMargin: number;
  isDiamond: boolean;
  isProcessFlowModeEnabled: boolean;
  hasChildren: boolean;
  /** Actual rendered square size of the diamond, in px (default DIAMOND_SIZE). */
  diamondSizePx?: number;
}): number {
  const base = opts.startY + opts.topMargin;
  if (!opts.isDiamond || !opts.isProcessFlowModeEnabled || !opts.hasChildren) return base;
  // With center-aligned diamond placement (see layout-engine), shifting child start upward
  // compounds offsets in diamond chains. Keep children anchored to the normal base.
  return base;
}

export function getDiamondSubtreeExtraTop(opts: {
  isDiamond: boolean;
  isProcessFlowModeEnabled: boolean;
  /** Actual rendered square size of the diamond, in px (default DIAMOND_SIZE). */
  diamondSizePx?: number;
}): number {
  // With center-aligned diamond placement (see layout-engine), diamonds do not need extra
  // reserved space above the subtree; allocating it compounds offsets in deep chains.
  return 0;
}

/**
 * Validation rule:
 * The 2nd branch target node's vertical center should align with the diamond's bottom corner.
 * If the 1st branch target center is at Y, then the bottom corner is at Y + DIAMOND_SIZE.
 */
export function getValidationSecondChildShiftY(opts: {
  firstChildCenterY: number;
  secondChildCenterY: number;
  /** Actual rendered square size of the diamond, in px (default DIAMOND_SIZE). */
  diamondSizePx?: number;
}): number {
  const size = opts.diamondSizePx ?? DIAMOND_SIZE;
  const desiredSecondCenterY = opts.firstChildCenterY + size;
  return Math.max(0, desiredSecondCenterY - opts.secondChildCenterY);
}

export function shiftSubtreeY(
  layout: Record<string, NodeLayout>,
  node: NexusNode,
  deltaY: number,
): void {
  if (!deltaY) return;
  const l = layout[node.id];
  if (l) layout[node.id] = { ...l, y: l.y + deltaY };
  node.children.forEach((child) => shiftSubtreeY(layout, child, deltaY));
  // Variants aren't used as descendants in the main tree traversal, but keep safe.
  if (node.isHub && node.variants) {
    node.variants.forEach((v) => {
      if (v.id === node.id) return;
      shiftSubtreeY(layout, v, deltaY);
    });
  }
}

export function shiftSubtreeX(
  layout: Record<string, NodeLayout>,
  node: NexusNode,
  deltaX: number,
): void {
  if (!deltaX) return;
  const l = layout[node.id];
  if (l) layout[node.id] = { ...l, x: l.x + deltaX };
  node.children.forEach((child) => shiftSubtreeX(layout, child, deltaX));
  // Variants aren't used as descendants in the main tree traversal, but keep safe.
  if (node.isHub && node.variants) {
    node.variants.forEach((v) => {
      if (v.id === node.id) return;
      shiftSubtreeX(layout, v, deltaX);
    });
  }
}

