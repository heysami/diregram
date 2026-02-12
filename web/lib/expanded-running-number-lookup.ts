import { NexusNode } from '@/types/nexus';
import { extractExpandedIdsFromMarkdown } from '@/lib/expanded-state-storage';

/**
 * Build a Map<nodeId, runningNumber> for expanded nodes using persistent `<!-- expid:N -->` markers.
 * Optionally merges in a fallback Map<runningNumber, nodeId> (e.g. from `<!-- expanded:N -->`)
 * so older docs still work.
 */
export function buildExpandedNodeIdToRunningNumberLookup(opts: {
  markdown: string;
  roots: NexusNode[];
  fallbackRunningNumberToNodeId?: Map<number, string>;
}): Map<string, number> {
  const { markdown, roots, fallbackRunningNumberToNodeId } = opts;
  const lineIndexToExpId = extractExpandedIdsFromMarkdown(markdown);
  const runningNumberToNodeId = new Map<number, string>();

  const visit = (n: NexusNode) => {
    const rn = lineIndexToExpId.get(n.lineIndex);
    if (rn !== undefined) runningNumberToNodeId.set(rn, n.id);
  };

  const walk = (nodes: NexusNode[]) => {
    nodes.forEach((n) => {
      visit(n);
      if (n.isHub && n.variants) {
        n.variants.forEach((v) => {
          visit(v);
          walk(v.children);
        });
      } else {
        walk(n.children);
      }
    });
  };
  walk(roots);

  // Merge in fallback (expanded:N) map so currently expanded nodes still work even if expid isn't present.
  if (fallbackRunningNumberToNodeId) {
    fallbackRunningNumberToNodeId.forEach((nodeId, rn) => runningNumberToNodeId.set(rn, nodeId));
  }

  const nodeIdToRunning = new Map<string, number>();
  runningNumberToNodeId.forEach((nodeId, rn) => nodeIdToRunning.set(nodeId, rn));
  return nodeIdToRunning;
}

