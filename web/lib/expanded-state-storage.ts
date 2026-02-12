import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { matchNodeByContent } from './expanded-state-matcher';

// Persistent expanded-id comment:
// - `<!-- expanded:N -->` = currently expanded (UI state)
// - `<!-- expid:N -->`    = node has expanded history + stable id for its expanded grid data
export const EXPANDED_ID_COMMENT_RE = /<!--\s*expid:(\d+)\s*-->/;

export function extractExpandedIdsFromMarkdown(markdown: string): Map<number, number> {
  const lines = markdown.split('\n');
  const lineIndexToExpId = new Map<number, number>();
  lines.forEach((line, index) => {
    const m = line.match(EXPANDED_ID_COMMENT_RE);
    if (!m) return;
    const rn = Number.parseInt(m[1], 10);
    if (Number.isFinite(rn)) lineIndexToExpId.set(index, rn);
  });
  return lineIndexToExpId;
}

export function stripExpandedIdComment(line: string): string {
  return line.replace(/\s*<!--\s*expid:\d+\s*-->\s*/g, ' ').replace(/\s+$/g, '');
}

export function upsertExpandedIdComment(line: string, rn: number): string {
  const cleaned = stripExpandedIdComment(line);
  return `${cleaned} <!-- expid:${rn} -->`;
}

/**
 * Store expanded state in markdown metadata, using a running number as an anchor
 * The running number is assigned when a node is expanded and stays with that content
 * even when nodes are added/removed, making it stable across redraws
 */

export interface ExpandedStateEntry {
  runningNumber: number; // Unique running number assigned when expanded (stable anchor)
  content: string; // Node content (for matching)
  parentPath: string[]; // Array of parent contents from root to direct parent
  lineIndex: number; // Line index in markdown (for precise matching)
}

export interface ExpandedStateData {
  nextRunningNumber: number; // Next number to assign
  entries: ExpandedStateEntry[]; // All expanded state entries
}

export function loadExpandedStates(doc: Y.Doc): ExpandedStateData {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const match = currentText.match(/```expanded-states\n([\s\S]*?)\n```/);
  
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      // Handle legacy format (array of entries) or new format (object with nextRunningNumber)
      if (Array.isArray(parsed)) {
        // Legacy format: just entries, calculate next running number
        const maxNumber = parsed.length > 0 
          ? Math.max(...parsed.map((e: ExpandedStateEntry) => e.runningNumber || 0))
          : 0;
        return {
          nextRunningNumber: maxNumber + 1,
          entries: parsed,
        };
      } else {
        // New format: object with nextRunningNumber and entries
        return {
          nextRunningNumber: parsed.nextRunningNumber || 1,
          entries: parsed.entries || [],
        };
      }
    } catch (e) {
      console.error('Failed to parse expanded states:', e);
    }
  }
  
  return {
    nextRunningNumber: 1,
    entries: [],
  };
}

export function saveExpandedStates(
  doc: Y.Doc,
  data: ExpandedStateData,
  expandedRunningNumbers?: Set<number>
): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const lines = currentText.split('\n');
  
  // Build map of lineIndex -> runningNumber for annotation
  const lineToRunningNumber = new Map<number, number>();
  data.entries.forEach((entry) => {
    // If expandedRunningNumbers is provided, only annotate those.
    // Otherwise, fall back to legacy behavior (annotate all entries).
    if (!expandedRunningNumbers || expandedRunningNumbers.has(entry.runningNumber)) {
      lineToRunningNumber.set(entry.lineIndex, entry.runningNumber);
    }
  });
  
  // Remove old expanded annotations and add new ones
  const updatedLines = lines.map((line, index) => {
    // Remove old expanded annotation (format: <!-- expanded:N -->)
    let cleaned = line.replace(/<!--\s*expanded:\d+\s*-->/, '').trimEnd();
    
    // Add new annotation if this line has a running number
    const runningNumber = lineToRunningNumber.get(index);
    if (runningNumber !== undefined) {
      // Add comment annotation at the end of the line.
      // Also ensure the persistent expid marker exists so collapsed nodes can still be identified later.
      cleaned = upsertExpandedIdComment(cleaned, runningNumber);
      cleaned = cleaned + ` <!-- expanded:${runningNumber} -->`;
    }
    
    return cleaned;
  });
  
  const annotatedText = updatedLines.join('\n');
  
  // Update metadata block
  const metadataBlock = `\`\`\`expanded-states\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  
  const existingMatch = annotatedText.match(/```expanded-states\n[\s\S]*?\n```/);
  
  let newText: string;
  if (existingMatch) {
    newText = annotatedText.replace(/```expanded-states\n[\s\S]*?\n```/, metadataBlock);
  } else {
    const separatorIndex = annotatedText.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      newText = annotatedText.slice(0, separatorIndex) + '\n' + metadataBlock + '\n' + annotatedText.slice(separatorIndex);
    } else {
      newText = annotatedText + (annotatedText.endsWith('\n') ? '' : '\n') + '\n' + metadataBlock;
    }
  }
  
  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
}

/**
 * Build parent path for a node (array of parent contents from root)
 */
export function buildParentPath(node: NexusNode, nodeMap: Map<string, NexusNode>): string[] {
  const path: string[] = [];
  let current: NexusNode | null = node;
  
  while (current && current.parentId) {
    current = nodeMap.get(current.parentId) || null;
    if (current) {
      path.unshift(current.content.trim());
    }
  }
  
  return path;
}

/**
 * Build parent path for an expanded node, including variant information if the node is in a variant
 * This ensures expanded nodes in different variants are distinguished even if they have the same content
 * Similar to buildFlowNodeParentPath but for expanded nodes
 */
export function buildExpandedNodeParentPath(
  node: NexusNode,
  nodeMap: Map<string, NexusNode>,
  roots: NexusNode[]
): string[] {
  const path: string[] = [];
  let current: NexusNode | null = node;
  
  // Walk up the tree to find if this node is in a variant
  // A variant is a node that has conditions and is a child of a hub
  let variantNode: NexusNode | null = null;
  let checkNode: NexusNode | null = node;
  
  while (checkNode && checkNode.parentId) {
    const parent = nodeMap.get(checkNode.parentId);
    if (!parent) break;
    
    // If parent is a hub, check if current node (or an ancestor) is a variant
    if (parent.isHub && parent.variants) {
      // Check if checkNode or any of its ancestors is one of the variants
      let found = false;
      for (const variant of parent.variants) {
        const checkInVariant = (v: NexusNode): boolean => {
          if (v.id === checkNode!.id) {
            found = true;
            variantNode = variant;
            return true;
          }
          return v.children.some(child => checkInVariant(child));
        };
        if (checkInVariant(variant)) {
          break;
        }
      }
      if (found) break;
    }
    
    checkNode = parent;
  }
  
  // If node is in a variant, add variant identifier to path
  const vn = variantNode;
  if ((vn as any)?.conditions && Object.keys((vn as any).conditions).length > 0) {
    const variantKey = Object.entries((vn as any).conditions as Record<string, string>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    path.push(`[variant:${variantKey}]`);
  }
  
  // Build standard parent path (walking up to root)
  while (current && current.parentId) {
    current = nodeMap.get(current.parentId) || null;
    if (current) {
      // Include hub in path, but skip variant nodes (they're already represented by the variant identifier)
      if (current.isHub || (!current.conditions || Object.keys(current.conditions).length === 0)) {
        path.push(current.content.trim());
      }
    }
  }
  
  return path;
}

/**
 * Check if a node matches an expanded state entry by running number and content
 */
export function nodeMatchesExpandedState(
  node: NexusNode,
  state: ExpandedStateEntry,
  nodeMap: Map<string, NexusNode>
): boolean {
  const nodeParentPath = buildParentPath(node, nodeMap);
  
  // Match if running number, content, and parent path all match
  // The running number is the stable anchor that points to this specific content
  return (
    node.content.trim() === state.content.trim() &&
    nodeParentPath.length === state.parentPath.length &&
    nodeParentPath.every((p, i) => p === state.parentPath[i])
  );
}

/**
 * Find the running number for a node if it's expanded
 * DEPRECATED: Use matchNodeToExpandedState from expanded-state-matcher.ts instead
 * This function is kept for backward compatibility but delegates to the modularized version
 */
export function getRunningNumberForNode(
  node: NexusNode,
  states: ExpandedStateEntry[],
  nodeMap: Map<string, NexusNode>,
  roots: NexusNode[] = []
): { runningNumber: number; needsLineIndexUpdate: boolean; needsParentPathUpdate: boolean } | null {
  // Delegate to modularized matcher (content matching only, no markdown parsing)
  return matchNodeByContent(node, states, nodeMap, roots);
}
