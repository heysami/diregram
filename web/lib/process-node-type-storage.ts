/**
 * Store and load process node types in markdown metadata
 * Uses running numbers as stable identifiers
 */

import * as Y from 'yjs';
import { NexusNode } from '@/types/nexus';
import { FlowNodeType } from '@/components/DimensionFlowEditor';
import { loadFlowNodeStates, saveFlowNodeStates, buildFlowNodeParentPath } from './flow-node-storage';
import { buildParentPath } from './expanded-state-storage';

/**
 * Load process node types from markdown
 * Returns a map of nodeId -> FlowNodeType
 */
export function loadProcessNodeTypes(
  doc: Y.Doc,
  nodes: NexusNode[],
  getProcessNumber: (nodeId: string) => number | undefined
): Record<string, FlowNodeType> {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  
  const types: Record<string, FlowNodeType> = {};
  const separatorIndex = currentText.indexOf('\n---\n');
  const metadataSection = separatorIndex !== -1 ? currentText.slice(separatorIndex) : currentText;

  // Build lookup by running number.
  // IMPORTANT: do NOT rely on nodeId here; node ids are `node-<lineIndex>` and change when lines are inserted.
  const typeByRunningNumber = new Map<number, FlowNodeType>();
  const blockRe = /```process-node-type-(\d+)\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(metadataSection)) !== null) {
    const rn = Number(m[1]);
    if (!Number.isFinite(rn)) continue;
    try {
      const data = JSON.parse(m[2]);
      const t = data?.type as FlowNodeType | undefined;
      if (t) typeByRunningNumber.set(rn, t);
    } catch {
      // ignore malformed blocks
    }
  }
  
  nodes.forEach((node) => {
    if (!node.isFlowNode) return;
    const runningNumber = getProcessNumber(node.id);
    if (runningNumber !== undefined && typeByRunningNumber.has(runningNumber)) {
      types[node.id] = typeByRunningNumber.get(runningNumber)!;
    } else {
      types[node.id] = 'step';
    }
  });
  
  return types;
}

/**
 * Save process node type to markdown
 * Ensures metadata blocks are placed after the separator
 */
export function saveProcessNodeType(
  doc: Y.Doc,
  nodeId: string,
  type: FlowNodeType,
  node: NexusNode,
  nodeMap: Map<string, NexusNode>,
  roots: NexusNode[],
  getProcessNumber: (nodeId: string) => number | undefined
): number | undefined {
  if (!node || !node.isFlowNode) {
    console.error('saveProcessNodeType: node not found or not a process node:', nodeId);
    return undefined;
  }
  
  let runningNumber = getProcessNumber(nodeId);
  
  // If no running number exists, try to find or create one
  if (runningNumber === undefined) {
    // Try to find running number from existing flow node states
    const flowNodeData = loadFlowNodeStates(doc);
    // Use variant-aware parent path for non-common nodes, standard path for common nodes
    const nodeParentPath = node.isCommon 
      ? buildParentPath(node, nodeMap)
      : buildFlowNodeParentPath(node, nodeMap, roots);
    
    const matchingEntry = flowNodeData.entries.find(e => {
      // Match by content and parent path (which includes variant info for non-common nodes)
      return e.content === node.content.trim() &&
             e.parentPath.length === nodeParentPath.length &&
             e.parentPath.every((p, i) => p === nodeParentPath[i]);
    });
    
    if (matchingEntry) {
      runningNumber = matchingEntry.runningNumber;
    } else {
      // Assign a new running number
      runningNumber = flowNodeData.nextRunningNumber;
      
      // Save the new entry
      const newEntries = [...flowNodeData.entries, {
        runningNumber,
        content: node.content.trim(),
        parentPath: nodeParentPath,
        lineIndex: node.lineIndex,
      }];
      
      saveFlowNodeStates(doc, {
        nextRunningNumber: runningNumber + 1,
        entries: newEntries,
      });
    }
  }
  
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  // Include nodeId in the data block to ensure uniqueness and prevent cross-node type sharing
  const dataBlock = `\`\`\`process-node-type-${runningNumber}\n${JSON.stringify({ type, nodeId })}\n\`\`\``;
  
  const separatorIndex = currentText.indexOf('\n---\n');
  // Remove any existing blocks for this running number (defensive; avoids duplicates).
  const rnBlockRe = new RegExp(`\\n?\`\`\`process-node-type-${runningNumber}\\n[\\s\\S]*?\\n\`\`\`\\n?`, 'g');
  let newText: string;
  
  const without = currentText.replace(rnBlockRe, '\n');
  const sep = without.indexOf('\n---\n');
  // Always place metadata blocks AFTER the separator to avoid parsing as nodes.
  if (sep !== -1) {
    newText = without.slice(0, sep + 5) + '\n' + dataBlock + without.slice(sep + 5);
  } else {
    newText = without + (without.endsWith('\n') ? '' : '\n') + '\n---\n' + dataBlock;
  }
  
  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
  
  return runningNumber;
}
