import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { ensureRunningNumberTagsForNodes, extractRnCommentsFromMarkdown } from '@/lib/node-running-numbers';

function indexNodesById(roots: NexusNode[]): Map<string, NexusNode> {
  const byId = new Map<string, NexusNode>();
  const visited = new Set<string>();
  const walk = (n: NexusNode) => {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    byId.set(n.id, n);
    n.children.forEach(walk);
    if (n.isHub && n.variants) n.variants.forEach(walk);
  };
  roots.forEach(walk);
  return byId;
}

export function computeFlowTabReferenceAnchors(opts: {
  doc: Y.Doc;
  rootProcessNodeId: string;
  targetNodeId: string;
}): { rootProcessRunningNumber?: number; targetRunningNumber?: number } {
  const { doc, rootProcessNodeId, targetNodeId } = opts;

  // Ensure rn tags exist for the referenced nodes (best-effort).
  try {
    const md0 = doc.getText('nexus').toString();
    const roots0 = parseNexusMarkdown(md0);
    const byId0 = indexNodesById(roots0);
    const toEnsure: Array<{ id: string; lineIndex: number }> = [];
    const root0 = byId0.get(rootProcessNodeId) || null;
    const target0 = byId0.get(targetNodeId) || null;
    if (root0) toEnsure.push({ id: root0.id, lineIndex: root0.lineIndex });
    if (target0 && target0.id !== root0?.id) toEnsure.push({ id: target0.id, lineIndex: target0.lineIndex });
    if (toEnsure.length) ensureRunningNumberTagsForNodes({ doc, nodes: toEnsure });
  } catch {
    // ignore
  }

  const md = doc.getText('nexus').toString();
  const roots = parseNexusMarkdown(md);
  const byId = indexNodesById(roots);
  const rnByLine = extractRnCommentsFromMarkdown(md);
  const root = byId.get(rootProcessNodeId) || null;
  const target = byId.get(targetNodeId) || null;
  const rootProcessRunningNumber = root ? rnByLine.get(root.lineIndex) : undefined;
  const targetRunningNumber = target ? rnByLine.get(target.lineIndex) : undefined;
  return {
    ...(typeof rootProcessRunningNumber === 'number' ? { rootProcessRunningNumber } : null),
    ...(typeof targetRunningNumber === 'number' ? { targetRunningNumber } : null),
  };
}

