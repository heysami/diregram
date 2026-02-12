/**
 * ⚠️ IMPORTANT: This module is stable and working. Do not modify unless fixing bugs.
 * 
 * This module handles matching nodes to dimension descriptions using running numbers from markdown comments.
 * Modifying this module can break existing dimension description matching, especially with duplicate content.
 * 
 * If you need different matching behavior, consider:
 * 1. Creating a new module for your specific use case
 * 2. Extending this module with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

import { NexusNode } from '@/types/nexus';
import { DimensionDescriptionEntry, DimensionDescriptionMode } from './dimension-description-storage';
import { buildParentPath } from './expanded-state-storage';

export interface DimensionDescriptionMatch {
  runningNumber: number;
  needsLineIndexUpdate: boolean;
  needsParentPathUpdate: boolean;
}

/**
 * Extract running numbers from markdown comments on each line for dimension descriptions
 * Format: <!-- desc:flow:Status:1,table:Priority:2 -->
 */
export function extractDimensionDescriptionRunningNumbersFromMarkdown(markdown: string): Map<number, Array<{ mode: DimensionDescriptionMode; dimensionKey: string; runningNumber: number }>> {
  const lines = markdown.split('\n');
  const lineIndexToDescriptions = new Map<number, Array<{ mode: DimensionDescriptionMode; dimensionKey: string; runningNumber: number }>>();
  
  lines.forEach((line, index) => {
    // Extract running numbers from <!-- desc:flow:Status:1,table:Priority:2 --> comment
    const match = line.match(/<!--\s*desc:([^>]+)\s*-->/);
    if (match) {
      const descParts = match[1].split(',');
      const descriptions: Array<{ mode: DimensionDescriptionMode; dimensionKey: string; runningNumber: number }> = [];
      
      descParts.forEach(part => {
        // Format: flow:Status:1 or table:Priority:2
        const descMatch = part.match(/^(flow|table):([^:]+):(\d+)$/);
        if (descMatch) {
          descriptions.push({
            mode: descMatch[1] as DimensionDescriptionMode,
            dimensionKey: descMatch[2],
            runningNumber: parseInt(descMatch[3], 10),
          });
        }
      });
      
      if (descriptions.length > 0) {
        lineIndexToDescriptions.set(index, descriptions);
      }
    }
  });
  
  return lineIndexToDescriptions;
}

/**
 * Match a node to a dimension description by running number from markdown comment
 * This is the primary matching method - most reliable, especially with duplicate content
 */
export function matchNodeByDimensionDescriptionComment(
  node: NexusNode,
  dimensionKey: string,
  mode: DimensionDescriptionMode,
  lineIndexToDescriptions: Map<number, Array<{ mode: DimensionDescriptionMode; dimensionKey: string; runningNumber: number }>>,
  entries: DimensionDescriptionEntry[],
  nodeMap: Map<string, NexusNode>
): DimensionDescriptionMatch | null {
  const descriptions = lineIndexToDescriptions.get(node.lineIndex);
  
  if (!descriptions) {
    return null; // No comment found for this line
  }
  
  // Find the description matching our dimension key and mode
  const matchingDesc = descriptions.find(d => d.dimensionKey === dimensionKey && d.mode === mode);
  
  if (!matchingDesc) {
    return null; // No matching description in comment
  }
  
  // Verify the entry exists
  const entry = entries.find(e => e.runningNumber === matchingDesc.runningNumber);
  if (!entry) {
    return null; // Entry not found in state data
  }
  
  // Check if entry needs updating
  const nodeParentPath = buildParentPath(node, nodeMap);
  const needsLineIndexUpdate = entry.lineIndex !== node.lineIndex;
  const needsParentPathUpdate = 
    entry.parentPath.length !== nodeParentPath.length ||
    !entry.parentPath.every((p, i) => p === nodeParentPath[i]);
  
  return {
    runningNumber: matchingDesc.runningNumber,
    needsLineIndexUpdate,
    needsParentPathUpdate,
  };
}

/**
 * Match a node to a dimension description by content (fallback method)
 * Only used when no markdown comment is found
 * Includes duplicate content guard - returns null if multiple entries have same content
 */
export function matchNodeByDimensionDescriptionContent(
  node: NexusNode,
  dimensionKey: string,
  mode: DimensionDescriptionMode,
  entries: DimensionDescriptionEntry[],
  nodeMap: Map<string, NexusNode>
): DimensionDescriptionMatch | null {
  const nodeParentPath = buildParentPath(node, nodeMap);
  const nodeContent = node.content.trim();
  
  // Filter entries by mode and dimension key first
  const relevantEntries = entries.filter(e => e.mode === mode && e.dimensionKey === dimensionKey);
  
  // First try exact match (content + parent path + line index) - most reliable
  for (const entry of relevantEntries) {
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
  for (const entry of relevantEntries) {
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
  const matchingByContent = relevantEntries.filter(e => e.content.trim() === nodeContent);
  if (matchingByContent.length === 1) {
    // Only one entry with this content - safe to match
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
 * Match a node to a dimension description
 * Tries running number from markdown comment first (most reliable), then falls back to content matching
 */
export function matchNodeToDimensionDescription(
  node: NexusNode,
  dimensionKey: string,
  mode: DimensionDescriptionMode,
  markdown: string,
  entries: DimensionDescriptionEntry[],
  nodeMap: Map<string, NexusNode>
): DimensionDescriptionMatch | null {
  // First, try to get running number from markdown comment (most reliable)
  const lineIndexToDescriptions = extractDimensionDescriptionRunningNumbersFromMarkdown(markdown);
  const commentMatch = matchNodeByDimensionDescriptionComment(
    node,
    dimensionKey,
    mode,
    lineIndexToDescriptions,
    entries,
    nodeMap
  );
  
  if (commentMatch !== null) {
    return commentMatch;
  }
  
  // Fall back to content matching (for backward compatibility)
  return matchNodeByDimensionDescriptionContent(node, dimensionKey, mode, entries, nodeMap);
}
