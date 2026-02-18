import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import type { FlowTabProcessReference } from '@/lib/flowtab-process-references';
import { extractRnCommentsFromMarkdown } from '@/lib/node-running-numbers';

function indexNodeIds(roots: NexusNode[]): Set<string> {
  const out = new Set<string>();
  const visited = new Set<string>();
  const walk = (n: NexusNode) => {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    out.add(n.id);
    n.children.forEach(walk);
    if (n.isHub && n.variants) n.variants.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

function buildRnToNodeIdMap(opts: { doc: Y.Doc; mainRoots: NexusNode[] }): Map<number, string> {
  const { doc, mainRoots } = opts;
  const md = doc.getText('nexus').toString();
  const rnByLine = extractRnCommentsFromMarkdown(md);
  const rnToNodeId = new Map<number, string>();
  const visited = new Set<string>();
  const walk = (n: NexusNode) => {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    const rn = rnByLine.get(n.lineIndex);
    if (typeof rn === 'number' && Number.isFinite(rn) && !rnToNodeId.has(rn)) rnToNodeId.set(rn, n.id);
    n.children.forEach(walk);
    if (n.isHub && n.variants) n.variants.forEach(walk);
  };
  mainRoots.forEach(walk);
  return rnToNodeId;
}

/**
 * Node ids are derived from line index (`node-<lineIndex>`), so they can drift when markdown changes.
 * This helper uses saved `rootProcessRunningNumber` / `targetRunningNumber` (<!-- rn:N -->) to repair refs.
 */
export function resolveFlowTabProcessReference(opts: {
  doc: Y.Doc;
  mainRoots: NexusNode[];
  reference: FlowTabProcessReference;
}): FlowTabProcessReference {
  const { doc, mainRoots, reference } = opts;
  const nodeIds = indexNodeIds(mainRoots);
  const rnToNodeId = buildRnToNodeIdMap({ doc, mainRoots });

  const hasId = (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0;

  try {
    if (reference.kind === 'whole') {
      const rootId = (reference as any).rootProcessNodeId;
      const rootRn = (reference as any).rootProcessRunningNumber;
      if (hasId(rootId) && !nodeIds.has(rootId) && typeof rootRn === 'number') {
        const mapped = rnToNodeId.get(rootRn) || null;
        if (mapped) return { ...reference, rootProcessNodeId: mapped, targetNodeId: mapped };
      }
      return reference;
    }

    // inner
    const rootId = (reference as any).rootProcessNodeId;
    const targetId = (reference as any).targetNodeId;
    const rootRn = (reference as any).rootProcessRunningNumber;
    const targetRn = (reference as any).targetRunningNumber;
    let next = { ...reference } as any;
    let changed = false;

    if (hasId(rootId) && !nodeIds.has(rootId) && typeof rootRn === 'number') {
      const mapped = rnToNodeId.get(rootRn) || null;
      if (mapped) {
        next.rootProcessNodeId = mapped;
        changed = true;
      }
    }
    if (hasId(targetId) && !nodeIds.has(targetId) && typeof targetRn === 'number') {
      const mapped = rnToNodeId.get(targetRn) || null;
      if (mapped) {
        next.targetNodeId = mapped;
        changed = true;
      }
    }
    return changed ? (next as FlowTabProcessReference) : reference;
  } catch {
    return reference;
  }
}

