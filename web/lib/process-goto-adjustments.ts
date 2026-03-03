import type { LayoutDirection } from '@/lib/layout-direction';
import type { NodeLayout } from '@/lib/layout-engine';
import type { NexusNode } from '@/types/nexus';

export type GotoRouteMode = 'default' | 'backtrack';

export function adjustGotoLayoutAndRouting(opts: {
  layout: Record<string, NodeLayout>;
  flattenedNodes: NexusNode[];
  nodeMap: Map<string, NexusNode>;
  processNodeTypes: Record<string, string | undefined>;
  gotoTargets: Record<string, string>;
  layoutDirection: LayoutDirection;
  isShowFlowOnForNode: (nodeId: string) => boolean;
}): {
  layout: Record<string, NodeLayout>;
  routeHintsByGotoId: Record<string, GotoRouteMode>;
  reversedBranchEdgeByKey: Record<string, true>;
} {
  const {
    layout,
    flattenedNodes,
    nodeMap,
    processNodeTypes,
    gotoTargets,
    layoutDirection,
    isShowFlowOnForNode,
  } = opts;

  const axis: 'x' | 'y' = layoutDirection === 'vertical' ? 'y' : 'x';
  const routeHintsByGotoId: Record<string, GotoRouteMode> = {};
  const reversedBranchEdgeByKey: Record<string, true> = {};
  const requestedAxisByTarget = new Map<string, number>();
  const excludedSubtreeRootsByTarget = new Map<string, Set<string>>();
  const baseAxisById = new Map<string, number>();
  const renderOrderById = new Map<string, number>();

  Object.entries(layout).forEach(([id, l]) => {
    baseAxisById.set(id, axis === 'x' ? l.x : l.y);
  });
  flattenedNodes.forEach((n, idx) => {
    renderOrderById.set(n.id, idx);
  });

  const findNearestValidationAncestor = (nodeId: string): NexusNode | null => {
    let cur = nodeMap.get(nodeId);
    while (cur?.parentId) {
      const parent = nodeMap.get(cur.parentId);
      if (!parent) return null;
      const parentType = processNodeTypes[parent.id];
      const isDecisionTyped = parentType === 'validation' || parentType === 'branch';
      const isStructuralBranchPoint = parent.isFlowNode && parent.children.length >= 2;
      if (isDecisionTyped || isStructuralBranchPoint) {
        return parent;
      }
      cur = parent;
    }
    return null;
  };

  const isDescendantOf = (ancestorId: string, nodeId: string): boolean => {
    if (!ancestorId || !nodeId || ancestorId === nodeId) return false;
    let cur = nodeMap.get(nodeId);
    while (cur?.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = nodeMap.get(cur.parentId);
    }
    return false;
  };

  const getDepth = (nodeId: string): number => {
    let depth = 0;
    let cur = nodeMap.get(nodeId);
    while (cur?.parentId) {
      depth += 1;
      cur = nodeMap.get(cur.parentId);
    }
    return depth;
  };

  const getDirectChildOnPath = (ancestorId: string, descendantId: string): string | null => {
    if (!ancestorId || !descendantId || ancestorId === descendantId) return null;
    let cur = nodeMap.get(descendantId);
    while (cur?.parentId) {
      if (cur.parentId === ancestorId) return cur.id;
      cur = nodeMap.get(cur.parentId);
    }
    return null;
  };

  Object.entries(gotoTargets).forEach(([gotoId, targetId]) => {
    if (processNodeTypes[gotoId] !== 'goto') return;
    if (!isShowFlowOnForNode(gotoId)) return;
    if (!isShowFlowOnForNode(targetId)) return;

    const validation = findNearestValidationAncestor(gotoId);
    if (!validation) return;

    const validationAxis = baseAxisById.get(validation.id);
    const gotoAxis = baseAxisById.get(gotoId);
    const targetAxis = baseAxisById.get(targetId);
    if (
      validationAxis === undefined ||
      gotoAxis === undefined ||
      targetAxis === undefined ||
      !Number.isFinite(validationAxis) ||
      !Number.isFinite(gotoAxis) ||
      !Number.isFinite(targetAxis)
    ) {
      return;
    }

    const targetIsDescendantOfValidation = isDescendantOf(validation.id, targetId);
    const targetIsAncestorOfValidation = isDescendantOf(targetId, validation.id);
    const targetIsNearerThanGoto =
      Math.abs(targetAxis - validationAxis) < Math.abs(gotoAxis - validationAxis);
    const targetIsBeforeValidation = targetAxis <= validationAxis;
    const targetOrder = renderOrderById.get(targetId);
    const validationOrder = renderOrderById.get(validation.id);
    const gotoOrder = renderOrderById.get(gotoId);
    const targetAppearsBeforeValidation =
      targetOrder !== undefined &&
      validationOrder !== undefined &&
      targetOrder < validationOrder;
    const targetAppearsBeforeGoto =
      targetOrder !== undefined &&
      gotoOrder !== undefined &&
      targetOrder < gotoOrder;
    const targetAxisBeforeGoto = targetAxis <= gotoAxis;

    const isCase2 = targetIsDescendantOfValidation && targetIsNearerThanGoto;
    const isCase3 =
      !targetIsDescendantOfValidation &&
      (
        targetIsBeforeValidation ||
        targetIsAncestorOfValidation ||
        targetAppearsBeforeValidation ||
        targetAppearsBeforeGoto ||
        targetAxisBeforeGoto
      );

    routeHintsByGotoId[gotoId] = isCase3 ? 'backtrack' : 'default';
    if (isCase3) {
      // Reverse arrow direction for the branch path that leads from validation to this goto.
      let cur = nodeMap.get(gotoId);
      while (cur?.parentId) {
        const parentId = cur.parentId;
        reversedBranchEdgeByKey[`${parentId}__${cur.id}`] = true;
        if (parentId === validation.id) break;
        cur = nodeMap.get(parentId);
      }
    }

    if (!(isCase2 || isCase3)) return;
    const requested = requestedAxisByTarget.get(targetId);
    if (requested === undefined || gotoAxis > requested) {
      requestedAxisByTarget.set(targetId, gotoAxis);
    }

    // If target is an ancestor of the goto path, do not shift only the validation child branch
    // that leads to goto. Keep other descendants movable.
    const gotoBranchRoot = getDirectChildOnPath(validation.id, gotoId);
    if (gotoBranchRoot && isDescendantOf(targetId, gotoBranchRoot)) {
      const set = excludedSubtreeRootsByTarget.get(targetId) || new Set<string>();
      set.add(gotoBranchRoot);
      excludedSubtreeRootsByTarget.set(targetId, set);
    }
  });

  if (requestedAxisByTarget.size === 0) {
    return { layout, routeHintsByGotoId, reversedBranchEdgeByKey };
  }

  const adjustedLayout: Record<string, NodeLayout> = { ...layout };
  const orderById = new Map<string, number>();
  flattenedNodes.forEach((n, i) => {
    orderById.set(n.id, i);
  });
  const targetsOrdered = Array.from(requestedAxisByTarget.entries()).sort((a, b) => {
    const depthDelta = getDepth(a[0]) - getDepth(b[0]);
    if (depthDelta !== 0) return depthDelta;
    return (orderById.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (orderById.get(b[0]) ?? Number.MAX_SAFE_INTEGER);
  });

  const shiftSubtreeAlongAxis = (targetId: string, delta: number): void => {
    if (!delta || !Number.isFinite(delta) || delta <= 0) return;
    const targetNode = nodeMap.get(targetId);
    if (!targetNode) return;
    const excludedRoots = excludedSubtreeRootsByTarget.get(targetId) || new Set<string>();

    const targetLayout = adjustedLayout[targetId];
    if (targetLayout) {
      adjustedLayout[targetId] =
        axis === 'x'
          ? { ...targetLayout, x: targetLayout.x + delta }
          : { ...targetLayout, y: targetLayout.y + delta };
    }

    const stack: string[] = [];
    targetNode.children.forEach((child) => {
      stack.push(child.id);
    });
    const visited = new Set<string>();

    while (stack.length) {
      const currentId = stack.pop()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      if (excludedRoots.has(currentId)) continue;

      const l = adjustedLayout[currentId];
      if (l) {
        adjustedLayout[currentId] =
          axis === 'x' ? { ...l, x: l.x + delta } : { ...l, y: l.y + delta };
      }

      const n = nodeMap.get(currentId);
      if (!n) continue;
      n.children.forEach((child) => {
        stack.push(child.id);
      });
    }
  };

  targetsOrdered.forEach(([targetId, desiredAxis]) => {
    const l = adjustedLayout[targetId];
    if (!l) return;
    const currentAxis = axis === 'x' ? l.x : l.y;
    const delta = desiredAxis - currentAxis;
    if (delta > 0) {
      shiftSubtreeAlongAxis(targetId, delta);
    }
  });

  return { layout: adjustedLayout, routeHintsByGotoId, reversedBranchEdgeByKey };
}
