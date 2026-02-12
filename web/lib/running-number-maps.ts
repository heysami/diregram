/**
 * Helpers for "running number" bookkeeping.
 *
 * IMPORTANT:
 * Node ids in this app are line-index based and can change/reuse after insert/remove.
 * So any mapping keyed by node id should be treated as a cache that must be rebuilt
 * from authoritative sources (markdown comments / storage blocks) rather than merged.
 */

/**
 * Convert a Map<runningNumber, nodeId> into the lookup we actually use in UI:
 * Map<nodeId, runningNumber>.
 */
export function buildNodeIdToRunningNumberMap(
  runningNumberToNodeId: Map<number, string>
): Map<string, number> {
  const map = new Map<string, number>();
  runningNumberToNodeId.forEach((nodeId, rn) => {
    map.set(nodeId, rn);
  });
  return map;
}

