/**
 * Store flow node state in markdown metadata, using a running number as an anchor
 * Similar to expanded-state-storage but for flow nodes
 */

import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { buildParentPath } from './expanded-state-storage';
import { FlowNode } from '@/components/DimensionFlowEditor';

export interface FlowNodeEntry {
  runningNumber: number;
  content: string; // Node content (for matching)
  parentPath: string[]; // Array of parent contents from root to direct parent
  lineIndex: number; // Line index in markdown (for precise matching)
}

export interface FlowNodeData {
  nextRunningNumber: number;
  entries: FlowNodeEntry[];
}

const STORAGE_BLOCK_TYPE = 'flow-nodes';

function tryParseJsonBlock(raw: string): any | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Attempt best-effort recovery if the fenced block contains extra text
    // (e.g. user pasted content, broken fence, or older format).
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Load flow node state from markdown
 */
export function loadFlowNodeStates(doc: Y.Doc): FlowNodeData {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  
  // Look for code block: ```flow-nodes\n{...}\n```
  const match = currentText.match(new RegExp(`\`\`\`${STORAGE_BLOCK_TYPE}\\n([\\s\\S]*?)\\n\`\`\``));
  
  if (match) {
    const parsed = tryParseJsonBlock(match[1]);
    if (parsed) {
      return {
        nextRunningNumber: parsed.nextRunningNumber || 1,
        entries: parsed.entries || [],
      };
    }
    // Don't spam console with stack traces; fall back safely.
    console.warn('Flow node states block is not valid JSON; ignoring and using defaults.');
  }
  
  return {
    nextRunningNumber: 1,
    entries: [],
  };
}

/**
 * Save flow node state to markdown
 */
export function saveFlowNodeStates(doc: Y.Doc, data: FlowNodeData): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  
  const storageBlock = `\`\`\`${STORAGE_BLOCK_TYPE}\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  
  const existingMatch = currentText.match(new RegExp(`\`\`\`${STORAGE_BLOCK_TYPE}\\n[\\s\\S]*?\\n\`\`\``));
  
  let newText: string;
  if (existingMatch) {
    newText = currentText.replace(new RegExp(`\`\`\`${STORAGE_BLOCK_TYPE}\\n[\\s\\S]*?\\n\`\`\``), storageBlock);
  } else {
    // Find the separator (---) or end of document
    const separatorIndex = currentText.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      // Insert before separator
      newText = currentText.slice(0, separatorIndex) + '\n' + storageBlock + '\n' + currentText.slice(separatorIndex);
    } else {
      // Append to end
      newText = currentText + (currentText.endsWith('\n') ? '' : '\n') + '\n' + storageBlock;
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
 * Build parent path for a flow node, including variant information if the node is in a variant
 * This ensures flow nodes in different variants are distinguished even if they have the same content
 */
export function buildFlowNodeParentPath(
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
  const vn = variantNode as any;
  if (vn?.conditions && Object.keys(vn.conditions).length > 0) {
    const variantKey = Object.entries(vn.conditions as Record<string, string>)
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
 * Load flow data for a specific node by running number
 */
export function loadFlowNodeData(doc: Y.Doc, runningNumber: number): {
  nodes: FlowNode[];
  edges: Record<string, { label: string; color: string }>;
} | null {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  
  // Look for code block: ```flow-node-{runningNumber}\n{...}\n```
  const match = currentText.match(new RegExp(`\`\`\`flow-node-${runningNumber}\\n([\\s\\S]*?)\\n\`\`\``));
  
  if (match) {
    try {
      const flowData = JSON.parse(match[1]);
      return {
        nodes: flowData.nodes || [],
        edges: flowData.edges || {},
      };
    } catch (e) {
      console.error('Failed to parse flow node data:', e);
    }
  }
  
  return null;
}

/**
 * Save flow data for a specific node by running number
 */
export function saveFlowNodeData(
  doc: Y.Doc,
  runningNumber: number,
  nodes: FlowNode[],
  edges: Record<string, { label: string; color: string }>
): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  
  const flowData = { nodes, edges };
  const storageBlock = `\`\`\`flow-node-${runningNumber}\n${JSON.stringify(flowData, null, 2)}\n\`\`\``;
  
  const existingMatch = currentText.match(new RegExp(`\`\`\`flow-node-${runningNumber}\\n[\\s\\S]*?\\n\`\`\``));
  
  let newText: string;
  if (existingMatch) {
    newText = currentText.replace(new RegExp(`\`\`\`flow-node-${runningNumber}\\n[\\s\\S]*?\\n\`\`\``), storageBlock);
  } else {
    // Find the separator (---) or end of document
    const separatorIndex = currentText.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      // Insert before separator
      newText = currentText.slice(0, separatorIndex) + '\n' + storageBlock + '\n' + currentText.slice(separatorIndex);
    } else {
      // Append to end
      newText = currentText + (currentText.endsWith('\n') ? '' : '\n') + '\n' + storageBlock;
    }
  }
  
  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
}
