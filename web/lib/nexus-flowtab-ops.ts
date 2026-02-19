import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { loadFlowTabProcessReferences, saveFlowTabProcessReferences } from '@/lib/flowtab-process-references';
import { loadConnectorLabels, saveConnectorLabels } from '@/lib/process-connector-labels';
import { collectRootsFromMarkdown } from '@/lib/nexus-root-collect';
import { computeIndentedBlockEndExclusive, findLineIndexByToken, removeFencedBlock } from '@/lib/nexus-markdown-edit';

export function getFlowTabFid(root: NexusNode) {
  return (((root.metadata as any)?.fid as string) || root.id) as string;
}

export function collectFlowTabRootsFromMarkdown(markdown: string) {
  return collectRootsFromMarkdown(markdown, (n) => !!(n.metadata as any)?.flowTab);
}

export function dedupeFlowTabRootsByFid(roots: NexusNode[]) {
  const byFid = new Map<string, NexusNode[]>();
  roots.forEach((r) => {
    const fid = getFlowTabFid(r);
    byFid.set(fid, [...(byFid.get(fid) || []), r]);
  });
  return Array.from(byFid.values()).map((arr) => arr.slice().sort((a, b) => a.lineIndex - b.lineIndex)[0]);
}

export function nextFlowTabFid(existingRoots: NexusNode[]) {
  let max = 0;
  existingRoots.forEach((r) => {
    const fid = (r.metadata as any)?.fid;
    const m = typeof fid === 'string' ? fid.match(/^flowtab-(\d+)$/) : null;
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `flowtab-${max + 1}`;
}

export function deleteFlowTabFlowFromDoc(opts: { doc: Y.Doc; fid: string; root: NexusNode }) {
  const { doc, fid, root } = opts;
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');

  const token = `<!-- fid:${fid} -->`;
  const startIdx = findLineIndexByToken(lines, token, root.lineIndex);
  if (startIdx < 0 || startIdx >= lines.length) return null;
  const endIdx = computeIndentedBlockEndExclusive(lines, startIdx);

  // Collect node ids in this flow subtree so we can prune references/labels.
  const deletedIds = new Set<string>();
  const stack: NexusNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n?.id || deletedIds.has(n.id)) continue;
    deletedIds.add(n.id);
    n.children?.forEach?.((c) => stack.push(c));
    if (n.isHub && n.variants) n.variants.forEach((v) => stack.push(v));
  }

  // Prune flow references for deleted nodes.
  const refs = loadFlowTabProcessReferences(doc);
  let prunedRefs = false;
  deletedIds.forEach((id) => {
    if (refs[id]) {
      delete refs[id];
      prunedRefs = true;
    }
  });

  // Prune connector labels touching deleted nodes.
  const labels = loadConnectorLabels(doc);
  let prunedLabels = false;
  Object.keys(labels).forEach((k) => {
    const [fromId, toId] = k.split('__');
    if (deletedIds.has(fromId) || deletedIds.has(toId)) {
      delete (labels as any)[k];
      prunedLabels = true;
    }
  });

  let nextMd = [...lines.slice(0, startIdx), ...lines.slice(endIdx)].join('\n');
  nextMd = removeFencedBlock(nextMd, `flowtab-swimlane-${fid}`);

  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, nextMd);
  });

  if (prunedRefs) saveFlowTabProcessReferences(doc, refs);
  if (prunedLabels) saveConnectorLabels(doc, labels);

  return { startIdx, endIdx, deletedNodeIds: deletedIds, prunedRefs, prunedLabels };
}

