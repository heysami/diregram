import * as Y from 'yjs';
import { NexusNode } from '@/types/nexus';

/**
 * Toggle flow node status by adding/removing #flow# tag in markdown
 * When enabling, also marks all children as process nodes
 */
export const toggleFlowNodeImpl = (
  doc: Y.Doc,
  targetNode: NexusNode,
  allNodes?: NexusNode[], // Pass all nodes to find children
): void => {
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');

  const lineIndex = targetNode.lineIndex;
  if (lineIndex < 0 || lineIndex >= lines.length) {
    console.error('Invalid line index:', lineIndex, 'lines.length:', lines.length);
    return;
  }

  const currentLine = lines[lineIndex];
  const isBecomingFlowNode = !targetNode.isFlowNode;

  const updatedLines = [...lines];
  
  // Update the target node
  let updatedLine: string;
  if (isBecomingFlowNode) {
    // Add #flow# tag if not present
    if (!currentLine.includes('#flow#')) {
      updatedLine = currentLine.trimEnd() + ' #flow#';
    } else {
      updatedLine = currentLine; // Already has tag
    }
  } else {
    // Remove #flow# tag
    updatedLine = currentLine.replace(/#flow#/g, '').trimEnd();
  }
  updatedLines[lineIndex] = updatedLine;

  // If becoming a process node, mark all children as process nodes too
  if (isBecomingFlowNode && allNodes) {
    // Build a map of all nodes by ID for efficient lookup
    const nodeMap = new Map<string, NexusNode>();
    const buildNodeMap = (nodes: NexusNode[]) => {
      nodes.forEach(n => {
        nodeMap.set(n.id, n);
        if (n.children) {
          buildNodeMap(n.children);
        }
      });
    };
    buildNodeMap(allNodes);
    
    // Recursively mark all descendants
    const markChildrenAsProcess = (nodeId: string) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;
      
      node.children.forEach(child => {
        const childLineIndex = child.lineIndex;
        if (childLineIndex >= 0 && childLineIndex < updatedLines.length) {
          const childLine = updatedLines[childLineIndex];
          if (childLine && !childLine.includes('#flow#')) {
            updatedLines[childLineIndex] = childLine.trimEnd() + ' #flow#';
          }
          // Recursively mark all descendants
          markChildrenAsProcess(child.id);
        }
      });
    };
    markChildrenAsProcess(targetNode.id);
  }
  
  // If removing process node status, also remove from all children
  if (!isBecomingFlowNode && allNodes) {
    // Build a map of all nodes by ID for efficient lookup
    const nodeMap = new Map<string, NexusNode>();
    const buildNodeMap = (nodes: NexusNode[]) => {
      nodes.forEach(n => {
        nodeMap.set(n.id, n);
        if (n.children) {
          buildNodeMap(n.children);
        }
      });
    };
    buildNodeMap(allNodes);
    
    // Recursively remove from all descendants
    const removeFromChildren = (nodeId: string) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;
      
      node.children.forEach(child => {
        const childLineIndex = child.lineIndex;
        if (childLineIndex >= 0 && childLineIndex < updatedLines.length) {
          const childLine = updatedLines[childLineIndex];
          if (childLine && childLine.includes('#flow#')) {
            updatedLines[childLineIndex] = childLine.replace(/#flow#/g, '').trimEnd();
          }
          // Recursively remove from all descendants
          removeFromChildren(child.id);
        }
      });
    };
    removeFromChildren(targetNode.id);
  }

  // Only update if something changed
  const newText = updatedLines.join('\n');
  const currentText = yText.toString();
  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
};
