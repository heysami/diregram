import { NexusNode } from '@/types/nexus';

export type BlockedMoveReason =
  | { kind: 'process_root_parent'; message: string }
  | { kind: 'conditional_root_parent'; message: string };

/**
 * Guard for Cmd+Left (unindent) move.
 *
 * We disallow structural unindent when the node is directly under:
 * - a root process node, or
 * - a conditional root (hub)
 *
 * Exception: if the node is visually indented via `>>` (visualLevel > 0),
 * Cmd+Left should still work because it only changes visual indentation and
 * does not reparent in the structural tree.
 */
export function getBlockedCmdUnindentReason(
  node: NexusNode,
  nodeMap: Map<string, NexusNode>
): BlockedMoveReason | null {
  // Visual indent exception: allow.
  if (node.visualLevel && node.visualLevel > 0) return null;
  if (!node.parentId) return null;

  const parent = nodeMap.get(node.parentId);
  if (!parent) return null;

  const parentIsRootProcess =
    !!parent.isFlowNode && (!parent.parentId || !nodeMap.get(parent.parentId)?.isFlowNode);
  if (parentIsRootProcess) {
    return { kind: 'process_root_parent', message: 'Cannot move left: node is directly under a process root.' };
  }

  const parentIsConditionalRoot = !!parent.isHub;
  if (parentIsConditionalRoot) {
    return {
      kind: 'conditional_root_parent',
      message: 'Cannot move left: node is directly under a conditional root.',
    };
  }

  return null;
}

