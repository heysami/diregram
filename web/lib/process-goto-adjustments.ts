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
  const shiftRequests: Array<{ gotoId: string; targetId: string }> = [];
  const excludedSubtreeRootsByTarget = new Map<string, Set<string>>();
  const mirrorBranchRootsByValidation = new Map<string, Set<string>>();
  const baseAxisById = new Map<string, number>();

  Object.entries(layout).forEach(([id, l]) => {
    baseAxisById.set(id, axis === 'x' ? l.x : l.y);
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
    const targetIsNearerThanGoto =
      Math.abs(targetAxis - validationAxis) < Math.abs(gotoAxis - validationAxis);
    const targetIsBeforeValidation = targetAxis < validationAxis;

    const isCase2 = targetIsDescendantOfValidation && targetIsNearerThanGoto;
    const isCase3 = !targetIsDescendantOfValidation && targetIsBeforeValidation;

    routeHintsByGotoId[gotoId] = isCase3 ? 'backtrack' : 'default';
    if (isCase3) {
      // Mark the branch path that leads from validation -> goto so routing can mirror
      // connector sides while keeping semantic direction parent -> child.
      let cur = nodeMap.get(gotoId);
      while (cur?.parentId) {
        const parentId = cur.parentId;
        reversedBranchEdgeByKey[`${parentId}__${cur.id}`] = true;
        if (parentId === validation.id) break;
        cur = nodeMap.get(parentId);
      }
      const gotoBranchRoot = getDirectChildOnPath(validation.id, gotoId);
      if (gotoBranchRoot) {
        const set = mirrorBranchRootsByValidation.get(validation.id) || new Set<string>();
        set.add(gotoBranchRoot);
        mirrorBranchRootsByValidation.set(validation.id, set);
      }
    }

    if (!(isCase2 || isCase3)) return;
    shiftRequests.push({ gotoId, targetId });

    // If target is an ancestor of the goto path, do not shift only the validation child branch
    // that leads to goto. Keep other descendants movable.
    const gotoBranchRoot = getDirectChildOnPath(validation.id, gotoId);
    if (gotoBranchRoot && isDescendantOf(targetId, gotoBranchRoot)) {
      const set = excludedSubtreeRootsByTarget.get(targetId) || new Set<string>();
      set.add(gotoBranchRoot);
      excludedSubtreeRootsByTarget.set(targetId, set);
    }
  });

  if (shiftRequests.length === 0 && mirrorBranchRootsByValidation.size === 0) {
    return { layout, routeHintsByGotoId, reversedBranchEdgeByKey };
  }

  const adjustedLayout: Record<string, NodeLayout> = { ...layout };
  const orderById = new Map<string, number>();
  flattenedNodes.forEach((n, i) => {
    orderById.set(n.id, i);
  });

  const mirrorSubtreeAcrossValidation = (validationId: string, branchRootId: string): void => {
    const validationLayout = adjustedLayout[validationId];
    const baseValidationAxis = baseAxisById.get(validationId);
    const baseBranchAxis = baseAxisById.get(branchRootId);
    if (
      !validationLayout ||
      baseValidationAxis === undefined ||
      baseBranchAxis === undefined ||
      !Number.isFinite(baseValidationAxis) ||
      !Number.isFinite(baseBranchAxis)
    ) {
      return;
    }
    // Reverse only branches that were originally on the forward side of the validation node.
    if (!(baseBranchAxis > baseValidationAxis)) return;
    const currentValidationAxis = axis === 'x' ? validationLayout.x : validationLayout.y;

    const stack = [branchRootId];
    const visited = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const l = adjustedLayout[id];
      if (l) {
        const baseNodeAxis = baseAxisById.get(id);
        if (baseNodeAxis === undefined || !Number.isFinite(baseNodeAxis)) {
          const n = nodeMap.get(id);
          if (!n) continue;
          n.children.forEach((child) => stack.push(child.id));
          continue;
        }
        const offsetFromValidation = baseNodeAxis - baseValidationAxis;
        const mirroredAxis = currentValidationAxis - offsetFromValidation;
        adjustedLayout[id] =
          axis === 'x' ? { ...l, x: mirroredAxis } : { ...l, y: mirroredAxis };
      }
      const n = nodeMap.get(id);
      if (!n) continue;
      n.children.forEach((child) => stack.push(child.id));
    }
  };

  mirrorBranchRootsByValidation.forEach((branchRoots, validationId) => {
    branchRoots.forEach((branchRootId) => {
      mirrorSubtreeAcrossValidation(validationId, branchRootId);
    });
  });

  // IMPORTANT order for case-3:
  // 1) mirror/reverse branch placement first,
  // 2) then align target subtrees to (possibly mirrored) goto axis.
  const requestedAxisByTarget = new Map<string, number>();
  shiftRequests.forEach(({ gotoId, targetId }) => {
    const gotoLayout = adjustedLayout[gotoId];
    if (!gotoLayout) return;
    const gotoAxis = axis === 'x' ? gotoLayout.x : gotoLayout.y;
    if (!Number.isFinite(gotoAxis)) return;
    const requested = requestedAxisByTarget.get(targetId);
    if (requested === undefined || gotoAxis > requested) {
      requestedAxisByTarget.set(targetId, gotoAxis);
    }
  });

  if (requestedAxisByTarget.size === 0) {
    return { layout: adjustedLayout, routeHintsByGotoId, reversedBranchEdgeByKey };
  }

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

  const targetsOrdered = Array.from(requestedAxisByTarget.entries()).sort((a, b) => {
    const depthDelta = getDepth(a[0]) - getDepth(b[0]);
    if (depthDelta !== 0) return depthDelta;
    return (orderById.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (orderById.get(b[0]) ?? Number.MAX_SAFE_INTEGER);
  });

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
