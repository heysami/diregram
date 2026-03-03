/**
 * Store and load "Single Screen Steps" range endpoints for process nodes in markdown metadata.
 * Uses running numbers as stable identifiers (mirrors process-loop-storage/process-goto-storage).
 */

import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';

/**
 * Load last-step selections for Single Screen Steps from markdown.
 * Returns a map of startNodeId -> lastStepId.
 */
export function loadSingleScreenLastSteps(
  doc: Y.Doc,
  nodes: NexusNode[],
  getProcessNumber: (nodeId: string) => number | undefined,
): Record<string, string> {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();

  const separatorIndex = currentText.indexOf('\n---\n');
  const metadataSection = separatorIndex !== -1 ? currentText.slice(separatorIndex) : currentText;

  // Parse all blocks once and index by running number.
  const lastStepIdByRunningNumber = new Map<number, string>();
  const blockRe = /```process-single-screen-(\d+)\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(metadataSection)) !== null) {
    const rn = Number(m[1]);
    if (!Number.isFinite(rn)) continue;
    try {
      const data = JSON.parse(m[2] || '{}');
      const lastStepId = typeof data?.lastStepId === 'string' ? data.lastStepId.trim() : '';
      if (lastStepId) lastStepIdByRunningNumber.set(rn, lastStepId);
    } catch {
      // ignore malformed blocks
    }
  }

  const out: Record<string, string> = {};
  nodes.forEach((node) => {
    if (!node.isFlowNode) return;
    const rn = getProcessNumber(node.id);
    if (rn === undefined) return;
    const lastStepId = lastStepIdByRunningNumber.get(rn);
    if (lastStepId) out[node.id] = lastStepId;
  });

  return out;
}

/**
 * Save the last-step selection for a Single Screen Steps group.
 * Ensures metadata blocks are placed after the separator.
 *
 * Pass an empty lastStepId to remove the block.
 */
export function saveSingleScreenLastStep(doc: Y.Doc, runningNumber: number | undefined, lastStepId: string): void {
  if (runningNumber === undefined) return;

  const yText = doc.getText('nexus');
  const currentText = yText.toString();

  const rnBlockRe = new RegExp(`\\n?\`\`\`process-single-screen-${runningNumber}\\n[\\s\\S]*?\\n\`\`\`\\n?`, 'g');
  const without = currentText.replace(rnBlockRe, '\n');

  const trimmedLast = String(lastStepId || '').trim();
  if (!trimmedLast) {
    if (without !== currentText) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, without);
      });
    }
    return;
  }

  const dataBlock = `\`\`\`process-single-screen-${runningNumber}\n${JSON.stringify({ lastStepId: trimmedLast })}\n\`\`\``;
  const sep = without.indexOf('\n---\n');

  // Always place metadata blocks AFTER the separator to avoid parsing as nodes.
  const newText =
    sep !== -1
      ? without.slice(0, sep + 5) + '\n' + dataBlock + without.slice(sep + 5)
      : without + (without.endsWith('\n') ? '' : '\n') + '\n---\n' + dataBlock;

  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
}

