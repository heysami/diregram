import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { loadFlowNodeStates } from '@/lib/flow-node-storage';
import { loadProcessNodeTypes } from '@/lib/process-node-type-storage';
import { loadConnectorLabels } from '@/lib/process-connector-labels';
import type { FlowNodeType } from '@/components/DimensionFlowEditor';
import type { NexusTemplateHeader } from '@/lib/nexus-template';

export function buildTemplateFlowMetaForSubtree(opts: {
  doc: Y.Doc;
  root: NexusNode | null;
  getProcessRunningNumber?: (nodeId: string) => number | undefined;
}): NexusTemplateHeader['flowMeta'] | undefined {
  const { doc, root, getProcessRunningNumber } = opts;
  if (!root) return undefined;
  if (!getProcessRunningNumber) return undefined;

  const nodes: NexusNode[] = [];
  const visited = new Set<string>();
  const stack: NexusNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n?.id) continue;
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    nodes.push(n);
    (n.children || []).forEach((c) => stack.push(c));
    if (n.isHub && n.variants) (n.variants || []).forEach((v) => stack.push(v));
  }

  const flowNodes = nodes.filter((n) => n.isFlowNode);
  if (!flowNodes.length) return undefined;

  const runningNumbers = new Set<number>();
  flowNodes.forEach((n) => {
    const rn = getProcessRunningNumber(n.id);
    if (typeof rn === 'number' && Number.isFinite(rn)) runningNumbers.add(rn);
  });
  if (runningNumbers.size === 0) return undefined;

  const data = loadFlowNodeStates(doc);
  const entries = (data.entries || []).filter((e) => runningNumbers.has(e.runningNumber));
  const maxRn = Math.max(0, ...Array.from(runningNumbers));
  const nextRunningNumber = Math.max(Number(data.nextRunningNumber || 1), maxRn + 1);

  const typesByNodeId = loadProcessNodeTypes(doc, nodes, getProcessRunningNumber);
  const processNodeTypes: Record<string, FlowNodeType> = {};
  flowNodes.forEach((n) => {
    const rn = getProcessRunningNumber(n.id);
    if (typeof rn !== 'number' || !Number.isFinite(rn)) return;
    const t = typesByNodeId[n.id];
    if (!t) return;
    processNodeTypes[String(rn)] = t;
  });

  const connectorLabelsByOffset: Record<string, { label: string; color: string }> = {};
  try {
    const labels = loadConnectorLabels(doc);
    const rootLineIndex = root.lineIndex;
    for (const parent of nodes) {
      if (!parent.isFlowNode) continue;
      for (const child of parent.children || []) {
        if (!child?.id) continue;
        if (!child.isFlowNode) continue;
        const raw = labels[`${parent.id}__${child.id}`];
        const label = typeof raw?.label === 'string' ? raw.label : '';
        const color = typeof raw?.color === 'string' ? raw.color : '#000000';
        if (!label.trim()) continue;
        const fromOff = parent.lineIndex - rootLineIndex;
        const toOff = child.lineIndex - rootLineIndex;
        if (!Number.isFinite(fromOff) || !Number.isFinite(toOff) || fromOff < 0 || toOff < 0) continue;
        connectorLabelsByOffset[`${fromOff}__${toOff}`] = { label, color };
      }
    }
  } catch {
    // ignore
  }

  return {
    version: 1,
    flowNodes: { nextRunningNumber, entries: entries as any },
    ...(Object.keys(processNodeTypes).length ? { processNodeTypes: processNodeTypes as any } : {}),
    ...(Object.keys(connectorLabelsByOffset).length ? { connectorLabelsByOffset } : {}),
  } as any;
}

