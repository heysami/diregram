/**
 * Store and load loop targets for process nodes in markdown metadata.
 * Uses running numbers as stable identifiers (mirrors process-goto-storage).
 */

import * as Y from 'yjs';
import { NexusNode } from '@/types/nexus';

/**
 * Load loop targets from markdown.
 * Returns a map of nodeId -> targetNodeId
 */
export function loadLoopTargets(
  doc: Y.Doc,
  nodes: NexusNode[],
  getProcessNumber: (nodeId: string) => number | undefined,
): Record<string, string> {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();

  const loopMap: Record<string, string> = {};
  const separatorIndex = currentText.indexOf('\n---\n');
  const metadataSection = separatorIndex !== -1 ? currentText.slice(separatorIndex) : currentText;

  nodes.forEach((node) => {
    if (!node.isFlowNode) return;
    const runningNumber = getProcessNumber(node.id);
    if (runningNumber === undefined) return;

    const match = metadataSection.match(
      new RegExp(`\\\`\\\`\\\`process-loop-${runningNumber}\\n([\\s\\S]*?)\\n\\\`\\\`\\\``),
    );
    if (!match) return;
    try {
      const data = JSON.parse(match[1]);
      if (data?.targetId) {
        loopMap[node.id] = data.targetId;
      }
    } catch (e) {
      console.error('Failed to parse loop target:', e);
    }
  });

  return loopMap;
}

/**
 * Save loop target to markdown.
 * Ensures metadata blocks are placed after the separator.
 */
export function saveLoopTarget(
  doc: Y.Doc,
  nodeId: string,
  targetId: string,
  runningNumber: number | undefined,
): void {
  if (runningNumber === undefined) return;

  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const dataBlock = `\`\`\`process-loop-${runningNumber}\n${JSON.stringify({ targetId })}\n\`\`\``;

  const existingMatch = currentText.match(
    new RegExp(`\\\`\\\`\\\`process-loop-${runningNumber}\\n[\\s\\S]*?\\n\\\`\\\`\\\``),
  );
  const separatorIndex = currentText.indexOf('\n---\n');

  let newText: string;
  if (existingMatch) {
    if (targetId) {
      newText = currentText.replace(
        new RegExp(`\\\`\\\`\\\`process-loop-${runningNumber}\\n[\\s\\S]*?\\n\\\`\\\`\\\``),
        dataBlock,
      );
    } else {
      // Remove if targetId is empty
      newText = currentText.replace(
        new RegExp(`\\\`\\\`\\\`process-loop-${runningNumber}\\n[\\s\\S]*?\\n\\\`\\\`\\\``),
        '',
      );
    }
  } else if (targetId) {
    // Add new
    if (separatorIndex !== -1) {
      newText =
        currentText.slice(0, separatorIndex + 5) +
        '\n' +
        dataBlock +
        currentText.slice(separatorIndex + 5);
    } else {
      newText = currentText + (currentText.endsWith('\n') ? '' : '\n') + '\n---\n' + dataBlock;
    }
  } else {
    return; // Nothing to do
  }

  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
}

