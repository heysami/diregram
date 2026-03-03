/**
 * Store and load "Single Screen Steps" range endpoints for process nodes in markdown metadata.
 * Uses running numbers as stable identifiers (mirrors process-loop-storage/process-goto-storage).
 */

import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { loadFlowNodeStates } from '@/lib/flow-node-storage';

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
  const lastByRunningNumber = new Map<number, { lastStepRunningNumber?: number; lastStepId?: string }>();
  const blockRe = /```process-single-screen-(\d+)\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(metadataSection)) !== null) {
    const rn = Number(m[1]);
    if (!Number.isFinite(rn)) continue;
    try {
      const data = JSON.parse(m[2] || '{}');
      const lastStepRunningNumberRaw = (data as any)?.lastStepRunningNumber;
      const lastStepRunningNumber =
        typeof lastStepRunningNumberRaw === 'number' && Number.isFinite(lastStepRunningNumberRaw)
          ? lastStepRunningNumberRaw
          : typeof lastStepRunningNumberRaw === 'string' && lastStepRunningNumberRaw.trim() !== '' && Number.isFinite(Number(lastStepRunningNumberRaw))
            ? Number(lastStepRunningNumberRaw)
            : undefined;

      const lastStepId = typeof (data as any)?.lastStepId === 'string' ? String((data as any).lastStepId).trim() : '';

      if (typeof lastStepRunningNumber === 'number') {
        lastByRunningNumber.set(rn, { lastStepRunningNumber });
      } else if (lastStepId) {
        // Backward compatibility (old format stored node-<lineIndex>).
        lastByRunningNumber.set(rn, { lastStepId });
      }
    } catch {
      // ignore malformed blocks
    }
  }

  // Build lookup: runningNumber -> nodeId (best-effort).
  const nodeIdByRunningNumber = new Map<number, string>();
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  nodes.forEach((node) => {
    if (!node.isFlowNode) return;
    const rn = getProcessNumber(node.id);
    if (typeof rn === 'number' && Number.isFinite(rn)) nodeIdByRunningNumber.set(rn, node.id);
  });

  // Extra fallback: use flow-nodes registry lineIndex mapping if the runningNumber->nodeId lookup is missing.
  const nodeIdByRunningNumberFromRegistry = new Map<number, string>();
  try {
    const flowNodesState = loadFlowNodeStates(doc);
    for (const e of flowNodesState.entries || []) {
      const rn = typeof (e as any)?.runningNumber === 'number' ? (e as any).runningNumber : null;
      const li = typeof (e as any)?.lineIndex === 'number' ? (e as any).lineIndex : null;
      if (typeof rn !== 'number' || !Number.isFinite(rn)) continue;
      if (typeof li !== 'number' || !Number.isFinite(li)) continue;
      const id = `node-${li}`;
      if (nodeIdSet.has(id)) nodeIdByRunningNumberFromRegistry.set(rn, id);
    }
  } catch {
    // best-effort only
  }

  const out: Record<string, string> = {};
  nodes.forEach((node) => {
    if (!node.isFlowNode) return;
    const rn = getProcessNumber(node.id);
    if (rn === undefined) return;
    const stored = lastByRunningNumber.get(rn);
    if (!stored) return;

    const resolved =
      (typeof stored.lastStepRunningNumber === 'number' &&
        (nodeIdByRunningNumber.get(stored.lastStepRunningNumber) ||
          nodeIdByRunningNumberFromRegistry.get(stored.lastStepRunningNumber))) ||
      (stored.lastStepId && nodeIdSet.has(stored.lastStepId) ? stored.lastStepId : '');

    if (resolved) out[node.id] = resolved;
  });

  return out;
}

/**
 * Save the last-step selection for a Single Screen Steps group.
 * Ensures metadata blocks are placed after the separator.
 *
 * Pass an undefined/empty lastStepRunningNumber to remove the block.
 */
export function saveSingleScreenLastStep(
  doc: Y.Doc,
  runningNumber: number | undefined,
  lastStepRunningNumber: number | undefined | null,
): void {
  if (runningNumber === undefined) return;

  const yText = doc.getText('nexus');
  const currentText = yText.toString();

  const rnBlockRe = new RegExp(`\\n?\`\`\`process-single-screen-${runningNumber}\\n[\\s\\S]*?\\n\`\`\`\\n?`, 'g');
  const without = currentText.replace(rnBlockRe, '\n');

  const last = typeof lastStepRunningNumber === 'number' && Number.isFinite(lastStepRunningNumber) ? lastStepRunningNumber : null;
  if (last === null) {
    if (without !== currentText) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, without);
      });
    }
    return;
  }

  const dataBlock = `\`\`\`process-single-screen-${runningNumber}\n${JSON.stringify({ lastStepRunningNumber: last })}\n\`\`\``;
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
