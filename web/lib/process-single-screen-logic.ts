import type { NexusNode } from '@/types/nexus';

export function getSingleScreenLastStepOptions(opts: { startNode: NexusNode }): NexusNode[] {
  const out: NexusNode[] = [];
  let cur: NexusNode | null = opts.startNode || null;

  while (cur) {
    const flowChildren: NexusNode[] = cur.children.filter((c) => c.isFlowNode);
    if (flowChildren.length !== 1) break;
    const next = flowChildren[0] || null;
    if (!next) break;
    out.push(next);
    cur = next;
  }

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
