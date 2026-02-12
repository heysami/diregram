import type { NexusNode } from '@/types/nexus';
import type { FlowTabProcessReference } from '@/lib/flowtab-process-references';
import { getUiTypeFromNodeTagIds, type UiTypeTagValue } from '@/lib/ui-type-tags';

export type TreeTestUiType = UiTypeTagValue;

export type TreeTestRunState =
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      /** Highest parent in the main canvas tree (first step) */
      startNodeId: string;
      /** For inner references, the node that should be shown first as a card (best-effort) */
      innerStartNodeId: string | null;
      nodeById: Map<string, NexusNode>;
      uiTypeByNodeId: Map<string, TreeTestUiType>;
      initialPath: string[];
      isDescendantOf: (nodeId: string, ancestorId: string) => boolean;
    };

function indexNodes(roots: NexusNode[]): Map<string, NexusNode> {
  const map = new Map<string, NexusNode>();
  const visited = new Set<string>();
  const walk = (n: NexusNode) => {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    map.set(n.id, n);
    n.children.forEach(walk);
    if (n.isHub && n.variants) n.variants.forEach(walk);
  };
  roots.forEach(walk);
  return map;
}

function highestParent(nodeId: string, nodeById: Map<string, NexusNode>): string | null {
  let cur: NexusNode | undefined = nodeById.get(nodeId);
  if (!cur) return null;
  while (cur.parentId) {
    const p = nodeById.get(cur.parentId);
    if (!p) break;
    cur = p;
  }
  return cur.id;
}

function makeIsDescendantOf(nodeById: Map<string, NexusNode>) {
  return (nodeId: string, ancestorId: string): boolean => {
    let cur: NexusNode | null = nodeById.get(nodeId) || null;
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parentId ? nodeById.get(cur.parentId) || null : null;
    }
    return false;
  };
}

export function runTreeTest(opts: { roots: NexusNode[]; reference: FlowTabProcessReference }): TreeTestRunState {
  const { roots, reference } = opts;
  const nodeById = indexNodes(roots);

  const targetNodeId = reference.kind === 'whole' ? reference.rootProcessNodeId : reference.targetNodeId;
  const startNodeId = highestParent(targetNodeId, nodeById);
  if (!startNodeId) {
    return {
      kind: 'error',
      message: 'Referenced node not found in the main canvas. It may have moved or been deleted.',
    };
  }

  const uiTypeByNodeId = new Map<string, TreeTestUiType>();
  nodeById.forEach((n, id) => {
    const ui = getUiTypeFromNodeTagIds(n.tags);
    if (ui) uiTypeByNodeId.set(id, ui);
  });

  return {
    kind: 'ready',
    startNodeId,
    innerStartNodeId: reference.kind === 'inner' ? reference.targetNodeId : null,
    nodeById,
    uiTypeByNodeId,
    initialPath: [startNodeId],
    isDescendantOf: makeIsDescendantOf(nodeById),
  };
}

