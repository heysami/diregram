/**
 * ⚠️ IMPORTANT: This module is stable and working. Do not modify unless fixing bugs.
 * 
 * This module handles matching nodes to expanded states using running numbers from markdown comments.
 * Modifying this module can break existing expanded state matching, especially with duplicate content.
 * 
 * If you need different matching behavior, consider:
 * 1. Creating a new module for your specific use case
 * 2. Extending this module with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

import { NexusNode } from '@/types/nexus';
import { ExpandedStateEntry, buildParentPath, buildExpandedNodeParentPath } from './expanded-state-storage';

export interface ExpandedStateMatch {
  runningNumber: number;
  needsLineIndexUpdate: boolean;
  needsParentPathUpdate: boolean;
}

/**
 * Extract running numbers from markdown comments on each line
 * This is the most reliable way to match nodes to expanded states, especially with duplicate content
 */
export function extractRunningNumbersFromMarkdown(markdown: string): Map<number, number> {
  const lines = markdown.split('\n');
  const lineIndexToRunningNumber = new Map<number, number>();
  
  lines.forEach((line, index) => {
    // Extract running number from <!-- expanded:N --> comment
    const match = line.match(/<!--\s*expanded:(\d+)\s*-->/);
    if (match) {
      const runningNumber = parseInt(match[1], 10);
      lineIndexToRunningNumber.set(index, runningNumber);
    }
  });
  
  return lineIndexToRunningNumber;
}

/**
 * Match a node to an expanded state by running number from markdown comment
 * This is the primary matching method - most reliable, especially with duplicate content
 */
export function matchNodeByRunningNumberComment(
  node: NexusNode,
  lineIndexToRunningNumber: Map<number, number>,
  entries: ExpandedStateEntry[],
  nodeMap: Map<string, NexusNode>,
  roots: NexusNode[]
): ExpandedStateMatch | null {
  const runningNumberFromComment = lineIndexToRunningNumber.get(node.lineIndex);
  
  if (runningNumberFromComment === undefined) {
    return null; // No comment found for this line
  }
  
  // Verify the entry exists
  const entry = entries.find(e => e.runningNumber === runningNumberFromComment);
  if (!entry) {
    return null; // Entry not found in state data
  }
  
  // Check if entry needs updating
  // Use variant-aware path builder to match against variant-aware saved paths
  const nodeParentPath = buildExpandedNodeParentPath(node, nodeMap, roots);
  const needsLineIndexUpdate = entry.lineIndex !== node.lineIndex;
  const needsParentPathUpdate = 
    entry.parentPath.length !== nodeParentPath.length ||
    !entry.parentPath.every((p, i) => p === nodeParentPath[i]);
  
  return {
    runningNumber: runningNumberFromComment,
    needsLineIndexUpdate,
    needsParentPathUpdate,
  };
}

/**
 * Match a node to an expanded state by content (fallback method)
 * Only used when no markdown comment is found
 * Includes duplicate content guard - returns null if multiple nodes have same content
 */
export function matchNodeByContent(
  node: NexusNode,
  entries: ExpandedStateEntry[],
  nodeMap: Map<string, NexusNode>,
  roots: NexusNode[]
): ExpandedStateMatch | null {
  // Use variant-aware path builder to match against variant-aware saved paths
  const nodeParentPath = buildExpandedNodeParentPath(node, nodeMap, roots);
  const nodeContent = node.content.trim();
  
  // First try exact match (content + parent path + line index) - most reliable
  for (const entry of entries) {
    if (
      nodeContent === entry.content.trim() &&
      nodeParentPath.length === entry.parentPath.length &&
      nodeParentPath.every((p, i) => p === entry.parentPath[i]) &&
      node.lineIndex === entry.lineIndex
    ) {
      return { 
        runningNumber: entry.runningNumber, 
        needsLineIndexUpdate: false, 
        needsParentPathUpdate: false 
      };
    }
  }
  
  // If line index doesn't match but content + parent path do, it's likely the same node
  // that shifted due to new nodes being added. Match it and update lineIndex.
  for (const entry of entries) {
    if (
      nodeContent === entry.content.trim() &&
      nodeParentPath.length === entry.parentPath.length &&
      nodeParentPath.every((p, i) => p === entry.parentPath[i])
    ) {
      return { 
        runningNumber: entry.runningNumber, 
        needsLineIndexUpdate: true, 
        needsParentPathUpdate: false 
      };
    }
  }
  
  // If parent path changed but content matches, node was moved to different parent
  // Only match by content if there's only one entry with that content (to avoid matching wrong node)
  const matchingByContent = entries.filter(e => e.content.trim() === nodeContent);
  if (matchingByContent.length === 1) {
    // Only one node with this content - safe to match
    return { 
      runningNumber: matchingByContent[0].runningNumber, 
      needsLineIndexUpdate: true, 
      needsParentPathUpdate: true 
    };
  }
  
  // Multiple entries with same content - don't match to avoid confusion
  // User will need to rely on exact match or content + parent path match
  return null;
}

/**
 * Match a node to an expanded state
 * 
 * IMPORTANT:
 * - We ONLY trust the running number from the markdown comment: <!-- expanded:N -->
 * - We NO LONGER fall back to content-based matching, because that can
 *   accidentally link multiple nodes with the same content to the same
 *   running number, causing "duplicate" expansions in the UI.
 * - This keeps expanded state strictly bound to the explicit running number
 *   annotation on that exact markdown line.
 */
export function matchNodeToExpandedState(
  node: NexusNode,
  markdown: string,
  entries: ExpandedStateEntry[],
  nodeMap: Map<string, NexusNode>,
  roots: NexusNode[]
): ExpandedStateMatch | null {
  // First, try to get running number from markdown comment (most reliable)
  const lineIndexToRunningNumber = extractRunningNumbersFromMarkdown(markdown);
  const commentMatch = matchNodeByRunningNumberComment(node, lineIndexToRunningNumber, entries, nodeMap, roots);
  
  if (commentMatch !== null) {
    return commentMatch;
  }

  // No comment for this node's line ⇒ treat as not matched.
  // We intentionally do NOT fall back to content-based heuristics here
  // to avoid linking different nodes that share the same text.
  return null;
}
