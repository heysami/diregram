/**
 * ⚠️ IMPORTANT: This module is stable and working. Do not modify unless fixing bugs.
 * 
 * This module handles synchronization of expanded state between markdown and React state.
 * It ensures that:
 * - Only nodes with comments (actually expanded) get entries saved
 * - Line indices are always kept up-to-date when nodes are added/moved
 * - Expanded state doesn't jump to wrong nodes
 * 
 * Modifying this module can break expanded state persistence and cause nodes to incorrectly expand/collapse.
 * 
 * If you need different sync behavior, consider:
 * 1. Creating a new module for your specific use case
 * 2. Extending this module with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

import { NexusNode } from '@/types/nexus';
import { ExpandedStateEntry, ExpandedStateData, buildExpandedNodeParentPath } from './expanded-state-storage';
import { extractRunningNumbersFromMarkdown } from './expanded-state-matcher';

export interface ExpandedStateSyncResult {
  runningNumberToNodeId: Map<number, string>;
  entryMap: Map<number, ExpandedStateEntry>;
  nodesWithComments: Set<string>;
  entriesToSave: ExpandedStateEntry[];
}

/**
 * Synchronize expanded state between markdown and current node tree
 * 
 * This function:
 * 1. Matches nodes to expanded state entries
 * 2. Updates entries with current line indices and parent paths
 * 3. Filters to only include nodes that are actually expanded (have comments)
 * 4. Determines which nodes should be in the expanded set
 * 5. Prepares entries to save (only expanded nodes, with current line indices)
 * 
 * @param markdown - Current markdown text
 * @param stateData - Loaded expanded state data
 * @param roots - Current root nodes
 * @param nodeMap - Map of all nodes by ID
 * @returns Sync result with maps and sets for updating state
 */
export function syncExpandedState(
  markdown: string,
  stateData: ExpandedStateData,
  roots: NexusNode[],
  nodeMap: Map<string, NexusNode>
): ExpandedStateSyncResult {
  // Extract which line indices have expanded comments
  // This tells us which nodes are actually expanded (not just have entries)
  const lineIndexToRunningNumber = extractRunningNumbersFromMarkdown(markdown);
  
  // Build map of running number to node ID purely from markdown comments.
  // This avoids any reliance on unstable node ids (which are line-index based) or
  // content-based heuristics that can diverge in hubs/variants/process flows.
  const runningNumberToNodeId = new Map<number, string>();
  const entryMap = new Map<number, ExpandedStateEntry>(); // Only entries for expanded nodes
  const nodesWithComments = new Set<string>();
  
  const visitNode = (node: NexusNode) => {
    const rn = lineIndexToRunningNumber.get(node.lineIndex);
    if (rn !== undefined) {
      runningNumberToNodeId.set(rn, node.id);
      nodesWithComments.add(node.id);

      const parentPath = buildExpandedNodeParentPath(node, nodeMap, roots);
      entryMap.set(rn, {
        runningNumber: rn,
        content: node.content.trim(),
        parentPath,
        lineIndex: node.lineIndex,
      });
    }
  };

  const traverse = (nodes: NexusNode[]) => {
    nodes.forEach((node) => {
      visitNode(node);
      if (node.isHub && node.variants) {
        node.variants.forEach((v) => {
          visitNode(v);
          traverse(v.children);
        });
      } else {
        traverse(node.children);
      }
    });
  };
  traverse(roots);
  
  // Prepare entries to save
  // Preserve collapsed entries (so their metadata doesn't get lost),
  // but always overwrite/update entries for nodes that are currently expanded (have comments).
  const mergedEntries = new Map<number, ExpandedStateEntry>();
  stateData.entries.forEach((e) => mergedEntries.set(e.runningNumber, e));
  entryMap.forEach((e, rn) => mergedEntries.set(rn, e));
  const entriesToSave = Array.from(mergedEntries.values()).sort((a, b) => a.runningNumber - b.runningNumber);
  
  return {
    runningNumberToNodeId,
    entryMap,
    nodesWithComments,
    entriesToSave,
  };
}
