/**
 * ⚠️ IMPORTANT: This module is stable and working. Do not modify unless fixing bugs.
 * 
 * This module provides utilities for detecting if a node is inside a variant structure.
 * It handles various edge cases including cloned nodes and broken parent chains.
 * 
 * Modifying this module can break the visibility of common node toggles and other
 * variant-related UI features.
 * 
 * If you need different detection behavior, consider:
 * 1. Creating a new module for your specific use case
 * 2. Extending this module with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

import { NexusNode } from '@/types/nexus';

/**
 * Check if a node is inside a variant structure (for showing variant-related UI)
 * 
 * This function checks multiple conditions:
 * 1. If the node itself is a variant (has conditions and parent is a hub)
 * 2. If any ancestor is a hub with variants
 * 3. If any ancestor is a variant (has conditions)
 * 4. If the node appears as a child in any variant (handles cloned nodes with broken parent chains)
 * 
 * @param node - The node to check
 * @param nodeMap - Map of all nodes by ID for parent traversal
 * @param roots - Root nodes of the tree for deep searching
 * @returns true if the node is inside a variant structure, false otherwise
 */
export function isNodeInsideVariant(
  node: NexusNode,
  nodeMap: Map<string, NexusNode>,
  roots: NexusNode[]
): boolean {
  // Check if node itself is a variant (has conditions and parent is a hub)
  if (node.conditions && Object.keys(node.conditions).length > 0 && node.parentId) {
    const parent = nodeMap.get(node.parentId);
    if (parent?.isHub) return true;
  }
  
  // Check if any ancestor is a hub with variants
  // Also check if the node is a child of any variant (even if parent chain is broken)
  let current: NexusNode | null = node;
  while (current && current.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    
    // If parent is a hub with variants, we're inside a variant structure
    if (parent.isHub && parent.variants && parent.variants.length > 0) {
      return true;
    }
    
    // If parent is a variant (has conditions), we're definitely inside a variant
    if (parent.conditions && Object.keys(parent.conditions).length > 0) {
      return true;
    }
    
    current = parent;
  }
  
  // Also check if this node appears as a child in any variant
  // This handles cases where cloned nodes might not have correct parentId
  for (const root of roots) {
    const checkInHub = (hub: NexusNode): boolean => {
      if (hub.isHub && hub.variants) {
        for (const variant of hub.variants) {
          const findNode = (n: NexusNode): boolean => {
            if (n.id === node.id) return true;
            return n.children.some(findNode);
          };
          if (findNode(variant)) return true;
        }
      }
      return hub.children.some(checkInHub);
    };
    if (checkInHub(root)) return true;
  }
  
  return false;
}
