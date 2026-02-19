import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { collectRootsFromMarkdown } from '@/lib/nexus-root-collect';
import { computeIndentedBlockEndExclusive, findLineIndexByToken, removeFencedBlock } from '@/lib/nexus-markdown-edit';

export function getSystemFlowSfid(root: NexusNode) {
  return (((root.metadata as any)?.sfid as string) || root.id) as string;
}

export function collectSystemFlowRootsFromMarkdown(markdown: string) {
  return collectRootsFromMarkdown(markdown, (n) => !!(n.metadata as any)?.systemFlow);
}

export function nextSystemFlowSfid(existingRoots: NexusNode[]) {
  let max = 0;
  existingRoots.forEach((r) => {
    const sfid = (r.metadata as any)?.sfid;
    const m = typeof sfid === 'string' ? sfid.match(/^systemflow-(\d+)$/) : null;
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `systemflow-${max + 1}`;
}

export function deleteSystemFlowFromDoc(opts: { doc: Y.Doc; sfid: string; root: NexusNode }) {
  const { doc, sfid, root } = opts;
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');

  const token = `<!-- sfid:${sfid} -->`;
  const startIdx = findLineIndexByToken(lines, token, root.lineIndex);
  if (startIdx < 0 || startIdx >= lines.length) return null;
  const endIdx = computeIndentedBlockEndExclusive(lines, startIdx);

  let nextMd = [...lines.slice(0, startIdx), ...lines.slice(endIdx)].join('\n');
  nextMd = removeFencedBlock(nextMd, `systemflow-${sfid}`);

  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, nextMd);
  });

  return { startIdx, endIdx };
}

