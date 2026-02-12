import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { loadFlowNodeStates, saveFlowNodeStates, buildFlowNodeParentPath, type FlowNodeEntry } from '@/lib/flow-node-storage';
import { buildParentPath } from '@/lib/expanded-state-storage';

/**
 * Upsert a `flow-nodes` registry entry by running number.
 *
 * This is used to keep the registry stable across RENAMES:
 * - The entry match logic is content+parentPath based.
 * - If a user renames a #flow# node but we don't update the registry entry, future rebuilds may fail to
 *   resolve the running number, causing the UI to temporarily fall back to default process types.
 */
export function upsertFlowNodeRegistryEntryByRunningNumber(opts: {
  doc: Y.Doc;
  roots: NexusNode[];
  node: NexusNode;
  nodeMap: Map<string, NexusNode>;
  runningNumber: number;
  content: string;
}): void {
  const { doc, roots, node, nodeMap, runningNumber, content } = opts;

  const flowData = loadFlowNodeStates(doc);
  const parentPath = node.isCommon ? buildParentPath(node, nodeMap) : buildFlowNodeParentPath(node, nodeMap, roots);

  const nextEntry: FlowNodeEntry = {
    runningNumber,
    content: (content || '').trim(),
    parentPath,
    lineIndex: node.lineIndex,
  };

  const nextEntries = [...flowData.entries];
  const idx = nextEntries.findIndex((e) => e.runningNumber === runningNumber);
  if (idx >= 0) nextEntries[idx] = nextEntry;
  else nextEntries.push(nextEntry);

  saveFlowNodeStates(doc, { ...flowData, entries: nextEntries });
}

