import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { loadFlowNodeStates, buildFlowNodeParentPath } from '@/lib/flow-node-storage';
import { buildParentPath } from '@/lib/expanded-state-storage';

/**
 * Build a lookup from parsed node id -> process/flow running number.
 *
 * Why this exists:
 * - Parsed node ids are currently `node-<lineIndex>` (see `nexus-parser.ts`) and therefore NOT stable
 *   under inserts/deletes above a node.
 * - Process node "type" (validation/branch/time/etc.) is keyed by a running number that comes from the
 *   `flow-nodes` registry. If we rebuild this lookup later (in an effect) or clear it mid-update, the UI
 *   can temporarily fall back to default types and cause flicker/diamond layout shifts.
 *
 * This helper is intentionally pure-ish and defensive: it avoids recursion (stack overflow) and returns
 * a fresh map each call.
 */
export function buildProcessRunningNumberMap(opts: {
  doc: Y.Doc;
  roots: NexusNode[];
}): Map<string, number> {
  const { doc, roots } = opts;

  // Build nodeMap for parent path building.
  const nodeMap = new Map<string, NexusNode>();
  const visited1 = new Set<string>();
  const stack: NexusNode[] = [...roots];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n?.id) continue;
    if (visited1.has(n.id)) continue;
    visited1.add(n.id);
    nodeMap.set(n.id, n);
    // Children
    for (let i = 0; i < (n.children?.length || 0); i += 1) stack.push(n.children[i]);
    // Variants
    if (n.isHub && n.variants && n.variants.length) {
      for (let i = 0; i < n.variants.length; i += 1) {
        const v = n.variants[i];
        if (!v?.id) continue;
        // Hubs store `variants` including themselves. Skip self to avoid cycles.
        if (v.id === n.id) continue;
        stack.push(v);
      }
    }
  }

  const flowNodeData = loadFlowNodeStates(doc);
  const next = new Map<string, number>();

  const visited2 = new Set<string>();
  const stack2: NexusNode[] = [...roots];
  while (stack2.length) {
    const node = stack2.pop()!;
    if (!node?.id) continue;
    if (visited2.has(node.id)) continue;
    visited2.add(node.id);

    if (node.isFlowNode) {
      const parentPath = node.isCommon
        ? buildParentPath(node, nodeMap)
        : buildFlowNodeParentPath(node, nodeMap, roots);
      const match = flowNodeData.entries.find((e) => {
        return (
          e.content === node.content.trim() &&
          e.parentPath.length === parentPath.length &&
          e.parentPath.every((p, i) => p === parentPath[i])
        );
      });
      if (match) next.set(node.id, match.runningNumber);
    }

    for (let i = 0; i < (node.children?.length || 0); i += 1) stack2.push(node.children[i]);
    if (node.isHub && node.variants && node.variants.length) {
      for (let i = 0; i < node.variants.length; i += 1) {
        const v = node.variants[i];
        if (!v?.id) continue;
        if (v.id === node.id) continue;
        stack2.push(v);
      }
    }
  }

  return next;
}

