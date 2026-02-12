import { useMemo } from 'react';

// Minimal interface for branch highlighting - only includes fields we need
export interface FlowNode {
  id: string;
  branchId?: string;
  forkSourceId?: string;
}

export interface Branch {
  id: string;
  label: string;
}

export interface ForkMeta {
  sourceNodeId: string;
  offsetColumns: number;
}

/**
 * Custom hook to calculate which nodes should be highlighted when hovering over a branch pill.
 * 
 * Highlights:
 * - All ancestor nodes (path from root to the fork point)
 * - Only the first child node in the branch
 * 
 * Does NOT highlight:
 * - Other nodes in the branch
 * - Descendant branches
 * 
 * @param branches - Array of all branches
 * @param nodes - Array of all nodes
 * @param forkMeta - Metadata about which branches were forked from which nodes
 * @returns A Map from branch ID to Set of node IDs that should be highlighted
 */
export function useBranchHighlighting(
  branches: Branch[],
  nodes: FlowNode[],
  forkMeta: Record<string, ForkMeta>
): Map<string, Set<string>> {
  return useMemo(() => {
    const map = new Map<string, Set<string>>();
    
    // Helper function to trace back to parent branches and get all ancestor nodes
    const getAncestorNodes = (branchId: string, visited = new Set<string>()): Set<string> => {
      if (visited.has(branchId)) return new Set();
      visited.add(branchId);
      
      const ancestorNodeIds = new Set<string>();
      const branchNodes = nodes.filter(
        (n) => (n.branchId || branches[0]?.id) === branchId,
      );
      
      if (branchNodes.length === 0) return ancestorNodeIds;
      
      // Check if this branch was forked from another branch
      const firstNode = branchNodes[0];
      if (firstNode.forkSourceId) {
        const sourceNode = nodes.find((n) => n.id === firstNode.forkSourceId);
        if (sourceNode) {
          // Add the source node
          ancestorNodeIds.add(sourceNode.id);
          
          // Get the source branch
          const sourceBranchId = sourceNode.branchId || branches[0]?.id;
          const sourceBranchNodes = nodes.filter(
            (n) => (n.branchId || branches[0]?.id) === sourceBranchId,
          );
          
          // Add all nodes from the start of the source branch up to and including the source node
          const sourceNodeIdx = sourceBranchNodes.findIndex((n) => n.id === sourceNode.id);
          if (sourceNodeIdx >= 0) {
            for (let i = 0; i <= sourceNodeIdx; i++) {
              ancestorNodeIds.add(sourceBranchNodes[i].id);
            }
          }
          
          // Recursively get ancestors of the source branch
          const sourceAncestors = getAncestorNodes(sourceBranchId, visited);
          sourceAncestors.forEach(id => ancestorNodeIds.add(id));
        }
      }
      
      return ancestorNodeIds;
    };
    
    // For each branch, get all nodes: ancestors + first child only
    branches.forEach((branch) => {
      const nodeIds = new Set<string>();
      
      // 1. Get all ancestor nodes (path back to root)
      const ancestorNodes = getAncestorNodes(branch.id);
      ancestorNodes.forEach(id => nodeIds.add(id));
      
      // 2. Get only the first node in this branch (first child)
      const branchNodes = nodes.filter(
        (n) => (n.branchId || branches[0]?.id) === branch.id,
      );
      if (branchNodes.length > 0) {
        nodeIds.add(branchNodes[0].id);
      }
      
      map.set(branch.id, nodeIds);
    });
    
    return map;
  }, [branches, nodes, forkMeta]);
}
