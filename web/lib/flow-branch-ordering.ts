import type { FlowNode } from '@/components/DimensionFlowEditor';

export type FlowBranch = { id: string; label: string };
export type ForkMeta = Record<string, { sourceNodeId: string; offsetColumns: number }>;

/**
 * Computes where a newly forked branch (row) should be inserted.
 *
 * Goal (match main process-node flow ordering):
 * - Never interleave/split an existing validation node's Yes/No subtree.
 * - When forking at a given column, insert the new row AFTER the existing continuation subtree
 *   that begins at the same or later column.
 */
export function getBranchInsertIndexForFork(opts: {
  branches: FlowBranch[];
  nodes: FlowNode[];
  forkMeta: ForkMeta;
  sourceBranchId: string;
  forkColumn: number; // absolute column where the fork branch begins
}): number {
  const { branches, nodes, forkMeta, sourceBranchId, forkColumn } = opts;

  const sourceBranchIndex = branches.findIndex((b) => b.id === sourceBranchId);
  if (sourceBranchIndex === -1) return branches.length;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const rootBranchId = branches[0]?.id;

  const getParentBranchId = (branchId: string): string | null => {
    const meta = forkMeta[branchId];
    if (!meta?.sourceNodeId) return null;
    const srcNode = nodeById.get(meta.sourceNodeId);
    return (srcNode?.branchId || rootBranchId) ?? null;
  };

  const isDescendantOf = (branchId: string, ancestorBranchId: string): boolean => {
    let cur: string | null = branchId;
    const seen = new Set<string>();
    while (cur && cur !== ancestorBranchId && !seen.has(cur)) {
      seen.add(cur);
      cur = getParentBranchId(cur);
    }
    return cur === ancestorBranchId;
  };

  let insertIndex = sourceBranchIndex + 1;
  branches.forEach((b, bIdx) => {
    if (bIdx <= sourceBranchIndex) return;
    const meta = forkMeta[b.id];
    if (!meta) return;
    if (!isDescendantOf(b.id, sourceBranchId)) return;
    if ((meta.offsetColumns ?? 0) >= forkColumn) {
      insertIndex = Math.max(insertIndex, bIdx + 1);
    }
  });

  return insertIndex;
}

