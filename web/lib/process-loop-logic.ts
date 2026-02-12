import type { NexusNode } from '@/types/nexus';

export function isDescendantOf(opts: {
  nodeMap: Map<string, NexusNode>;
  ancestorId: string;
  nodeId: string;
}): boolean {
  const { nodeMap, ancestorId, nodeId } = opts;
  if (!ancestorId || !nodeId) return false;
  if (ancestorId === nodeId) return false;
  let cur: NexusNode | undefined = nodeMap.get(nodeId);
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = nodeMap.get(cur.parentId);
  }
  return false;
}

export function getLoopTargetOptions(opts: {
  loopNode: NexusNode;
  flattenedNodes: NexusNode[];
}): NexusNode[] {
  const { loopNode, flattenedNodes } = opts;
  const out: NexusNode[] = [];
  const queue: NexusNode[] = [...(loopNode.children || [])];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.isFlowNode) out.push(cur);
    if (cur.children?.length) queue.push(...cur.children);
  }

  // Deterministic order: follow flattenedNodes order
  const indexById = new Map<string, number>(flattenedNodes.map((n, i) => [n.id, i]));
  out.sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0));

  return out;
}

export function computePaddedSpanBounds(opts: {
  from: { x: number; y: number; w: number; h: number };
  to: { x: number; y: number; w: number; h: number };
  pad: number;
}): { left: number; top: number; width: number; height: number } {
  const { from, to, pad } = opts;
  const left = Math.min(from.x, to.x) - pad;
  const top = Math.min(from.y, to.y) - pad;
  const right = Math.max(from.x + from.w, to.x + to.w) + pad;
  const bottom = Math.max(from.y + from.h, to.y + to.h) + pad;
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

