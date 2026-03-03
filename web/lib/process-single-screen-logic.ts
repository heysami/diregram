import type { NexusNode } from '@/types/nexus';

export function getSingleScreenLastStepOptions(opts: { startNode: NexusNode }): NexusNode[] {
  const start = opts.startNode;
  if (!start) return [];

  // Descendant options (similar to loop target selection). This allows last-step selection
  // even when the range contains branches.
  const out: NexusNode[] = [];
  const queue: NexusNode[] = [...(start.children || [])];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.isFlowNode) out.push(cur);
    const flowChildren = (cur.children || []).filter((c) => c.isFlowNode);
    if (flowChildren.length) queue.push(...flowChildren);
  }

  // Deterministic order.
  out.sort((a, b) => (a.lineIndex ?? 0) - (b.lineIndex ?? 0));
  return out;
}

/**
 * Compute the unique ancestor->descendant path from startNodeId to lastNodeId, using parent pointers.
 * Returns null if lastNodeId is not a descendant of startNodeId.
 */
export function computeSingleScreenPathIds(opts: {
  startNodeId: string;
  lastNodeId: string;
  nodeMap: Map<string, NexusNode>;
}): string[] | null {
  const { startNodeId, lastNodeId, nodeMap } = opts;
  if (!startNodeId || !lastNodeId) return null;
  if (startNodeId === lastNodeId) return [startNodeId];

  const last = nodeMap.get(lastNodeId);
  if (!last) return null;

  const path: string[] = [lastNodeId];
  let cur: NexusNode | undefined = last;
  const guard = new Set<string>([lastNodeId]);

  while (cur?.parentId) {
    if (cur.parentId === startNodeId) {
      path.push(startNodeId);
      path.reverse();
      return path;
    }
    const nextId = cur.parentId;
    if (!nextId || guard.has(nextId)) return null;
    guard.add(nextId);
    cur = nodeMap.get(nextId);
  }

  return null;
}

/**
 * Compute group membership for a Single Screen Steps range.
 *
 * Membership rule:
 * - Compute the ancestor->descendant path from start -> last (depth limit = path length - 1).
 * - Include ALL descendant #flow# nodes under start up to that depth (branch-aware).
 *
 * Returns null if last is not a descendant of start.
 */
export function computeSingleScreenMemberIds(opts: {
  startNodeId: string;
  lastNodeId: string;
  nodeMap: Map<string, NexusNode>;
}): { memberIds: string[]; depthById: Map<string, number>; maxDepth: number } | null {
  const { startNodeId, lastNodeId, nodeMap } = opts;
  const path = computeSingleScreenPathIds({ startNodeId, lastNodeId, nodeMap });
  if (!path || path.length < 2) return null;

  const maxDepth = Math.max(0, path.length - 1);
  const depthById = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length) {
    const { id, depth } = queue.shift()!;
    if (!id) continue;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (!node || !node.isFlowNode) continue;
    if (depth > maxDepth) continue;

    depthById.set(id, depth);

    if (depth === maxDepth) continue;
    const flowChildren = (node.children || []).filter((c) => c.isFlowNode);
    for (const c of flowChildren) {
      queue.push({ id: c.id, depth: depth + 1 });
    }
  }

  const memberIds = Array.from(depthById.keys());
  memberIds.sort((a, b) => {
    const an = nodeMap.get(a);
    const bn = nodeMap.get(b);
    return (an?.lineIndex ?? 0) - (bn?.lineIndex ?? 0);
  });

  return { memberIds, depthById, maxDepth };
}
