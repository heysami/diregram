import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { normalizeNodeContent, hasCommonTag } from './common-node-utils';

/**
 * Common Node Logic Module
 * 
 * This module handles all logic related to marking nodes as "common" across variants
 * and managing their duplication/removal. It is isolated from other features to prevent
 * unintended modifications.
 * 
 * Key behaviors:
 * - When marking a node as common: duplicates the path chain (not children) to other variants
 * - Checks for existing parents in other variants before inserting
 * - Marks existing parents as common if found
 * - When unmarking: removes common copies from other variants, keeps the original
 */

interface HubInfo {
  hub: NexusNode;
  sourceVariant: NexusNode;
  path: NexusNode[];
}

interface Mutation {
  index: number;
  text: string[];
  isInsert?: boolean;
}

/**
 * Toggles the common status of a node within a hub's variant structure.
 * 
 * @param doc - The Yjs document containing the markdown
 * @param targetNode - The node to toggle common status for
 * @param rawNodeMap - Map of all nodes by ID
 * @param roots - Root nodes of the tree
 */
export const toggleCommonNodeImpl = (
  doc: Y.Doc,
  targetNode: NexusNode,
  rawNodeMap: Map<string, NexusNode>,
  roots: NexusNode[],
): void => {
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');

  const lineIndex = targetNode.lineIndex;
  if (lineIndex >= lines.length) return;

  const currentLine = lines[lineIndex];
  const isBecomingCommon = !targetNode.isCommon;

  /**
   * Finds the hub and source variant containing the target node.
   * Builds the path from targetNode up to (but NOT including) the source variant.
   */
  const findHubAndSourceVariant = (): HubInfo | null => {
    if (!targetNode.parentId) return null;
    
    // First, find which hub and variant contains the target node
    let hub: NexusNode | null = null;
    let sourceVariant: NexusNode | null = null;
    
    // Search all hubs to find which one contains targetNode
    const searchHubs = (nodes: NexusNode[]): boolean => {
      for (const n of nodes) {
        if (n.isHub && n.variants) {
          // Check if targetNode is in this hub's variants
          for (const variant of n.variants) {
            const findInVariant = (v: NexusNode): boolean => {
              if (v.id === targetNode.id) {
                hub = n;
                sourceVariant = variant;
                return true;
              }
              return v.children.some(child => {
                const found = findInVariant(child);
                if (found && !sourceVariant) {
                  sourceVariant = variant;
                }
                return found;
              });
            };
            if (findInVariant(variant)) return true;
          }
        }
        if (searchHubs(n.children)) return true;
      }
      return false;
    };
    
    if (!searchHubs(roots) || !hub || !sourceVariant) return null;
    const sv = sourceVariant;
    
    // Now build path from targetNode up to (but NOT including) sourceVariant
    const path: NexusNode[] = [targetNode];
    let current: NexusNode | null = targetNode;
    
    while (current && current.parentId) {
      const parentMaybe: NexusNode | undefined = rawNodeMap.get(current.parentId as string);
      if (!parentMaybe) break;
      const parent = parentMaybe;
      
      // Stop if we reach the variant (don't include it in path)
      if ((parent as any).id === (sv as any).id) {
        break;
      }
      
      // Stop if we somehow reach the hub (shouldn't happen, but safety check)
      if ((parent as any).isHub) {
        break;
      }
      
      // Add parent to path
      path.unshift(parent);
      current = parent;
    }
    
    return { hub, sourceVariant: sv, path };
  };

  if (isBecomingCommon) {
    const hubInfo = findHubAndSourceVariant();
    if (!hubInfo) return; // Not within a hub, can't make common
    
    const { hub, sourceVariant, path } = hubInfo;
    
    // Mark this node and all its parents as common in the source variant
    const mutations: Mutation[] = [];
    
    // Path is [targetNode, parent, grandparent, ...] up to sourceVariant
    // Mark all nodes in the path as common (including parents)
    path.forEach(pathNode => {
      const pathLine = lines[pathNode.lineIndex];
      if (pathLine && !pathLine.includes('#common#')) {
        const updatedLine = pathLine.trimEnd() + ' #common#';
        mutations.push({ index: pathNode.lineIndex, text: [updatedLine] });
      }
    });

    // Reverse to match from variant level: [..., grandparent, parent, targetNode]
    const reversedPath = [...path].reverse();

    // Process each other variant
    if (hub.variants) {
      hub.variants.forEach(variant => {
        // Skip the source variant (we already marked the target node)
        if (variant.id === sourceVariant.id) return;

        // Match the path in this variant, starting from variant level
        let currentVariantNode: NexusNode | null = variant;
        let matchedPath: NexusNode[] = [];
        let nodesToUpdate: number[] = []; // Line indices that need #common# tag added
        
        for (const pathNode of reversedPath) {
          if (!currentVariantNode) break;
          
          // Find existing node with same content
          const matchingChild: NexusNode | undefined = currentVariantNode.children.find(
            (c: NexusNode) => c.content === pathNode.content,
          );
          
          if (matchingChild) {
            matchedPath.push(matchingChild);
            // Check if it needs #common# tag
            const childLine = lines[matchingChild.lineIndex];
            if (childLine && !childLine.includes('#common#')) {
              nodesToUpdate.push(matchingChild.lineIndex);
            }
            currentVariantNode = matchingChild;
          } else {
            break; // Node doesn't exist, will need to create it
          }
        }

        // Update existing nodes to add #common# tag
        nodesToUpdate.forEach(lineIdx => {
          const nodeLine = lines[lineIdx];
          if (nodeLine && !nodeLine.includes('#common#')) {
            mutations.push({ index: lineIdx, text: [nodeLine.trimEnd() + ' #common#'] });
          }
        });

        // Insert missing nodes if path is incomplete
        if (matchedPath.length < reversedPath.length) {
          // Get missing nodes from reversedPath
          // reversedPath = [grandparent, parent, targetNode] (indices: 0, 1, 2)
          // If matchedPath.length = 0: missing = [grandparent, parent, targetNode] (indices 0,1,2) - should insert in this order
          // If matchedPath.length = 1: missing = [parent, targetNode] (indices 1,2) - should insert parent then targetNode
          // But user says order is reverse, so let's reverse it
          const missingFromReversed = reversedPath.slice(matchedPath.length);
          // Reverse to fix the order issue
          const missingPath = [...missingFromReversed].reverse();
          
          // Check if any parent in missingPath already exists in the variant
          // We need to search the variant's subtree for nodes with matching content
          const findNodeByContent = (node: NexusNode, content: string): NexusNode | null => {
            // Extract content without tags for comparison using modularized utility
            const nodeContent = normalizeNodeContent(node.content);
            const searchContent = normalizeNodeContent(content);
            if (nodeContent === searchContent) {
              return node;
            }
            for (const child of node.children) {
              const found = findNodeByContent(child, content);
              if (found) return found;
            }
            return null;
          };
          
          // Find the first node in missingPath that doesn't exist
          let firstMissingIndex = 0;
          let existingParent: NexusNode | null = null;
          
          for (let i = 0; i < missingPath.length; i++) {
            const pathNode = missingPath[i];
            const sourceLine = lines[pathNode.lineIndex];
            if (sourceLine) {
              const match = sourceLine.match(/^(\s*)(.*)/);
              if (match) {
                // Use modularized utility for content normalization
                const content = normalizeNodeContent(match[2]);
                const found = findNodeByContent(variant, content);
                if (found) {
                  existingParent = found;
                  firstMissingIndex = i + 1; // Start inserting from the next node
                  
                  // Mark existing parent as common if not already marked
                  const foundLine = lines[found.lineIndex];
                  if (foundLine && !foundLine.includes('#common#')) {
                    const foundMatch = foundLine.match(/^(\s*)(.*)/);
                    if (foundMatch) {
                      const lineIdx = found.lineIndex;
                      mutations.push({ 
                        index: lineIdx, 
                        text: [foundLine.trimEnd() + ' #common#'] 
                      });
                    }
                  }
                } else {
                  break; // Found first missing node
                }
              }
            }
          }
          
          // Only insert nodes starting from firstMissingIndex
          const nodesToInsert = missingPath.slice(firstMissingIndex);
          
          // Find insertion point and base level (using actual markdown indentation)
          let insertIndex: number;
          let baseLevel: number;
          
          if (existingParent) {
            // Insert as children of the existing parent
            insertIndex = existingParent.lineIndex;
            const findEnd = (n: NexusNode) => {
              insertIndex = Math.max(insertIndex, n.lineIndex);
              n.children.forEach(findEnd);
            };
            findEnd(existingParent);
            // Get actual level from existing parent's markdown line
            const existingLine = lines[existingParent.lineIndex];
            const existingMatch = existingLine?.match(/^(\s*)/);
            const existingIndent = existingMatch ? existingMatch[1].length : 0;
            // Base level is one level deeper than existing parent
            baseLevel = Math.floor(existingIndent / 2) + 1;
          } else if (matchedPath.length > 0) {
            // Insert as children of the last matched node
            const lastMatched = matchedPath[matchedPath.length - 1];
            // Find the end of lastMatched's entire subtree
            insertIndex = lastMatched.lineIndex;
            const findEnd = (n: NexusNode) => {
              insertIndex = Math.max(insertIndex, n.lineIndex);
              n.children.forEach(findEnd);
            };
            findEnd(lastMatched);
            // Get actual level from markdown line
            const lastMatchedLine = lines[lastMatched.lineIndex];
            const lastMatch = lastMatchedLine?.match(/^(\s*)/);
            const lastMatchedIndent = lastMatch ? lastMatch[1].length : 0;
            // Base level is one level deeper than lastMatched (add 2 spaces = 1 level)
            baseLevel = Math.floor(lastMatchedIndent / 2) + 1;
          } else {
            // Insert as direct children of the variant
            insertIndex = variant.lineIndex;
            const findEnd = (n: NexusNode) => {
              insertIndex = Math.max(insertIndex, n.lineIndex);
              n.children.forEach(findEnd);
            };
            findEnd(variant);
            // Get actual level from variant's markdown line
            const variantLine = lines[variant.lineIndex];
            const variantMatch = variantLine?.match(/^(\s*)/);
            const variantIndent = variantMatch ? variantMatch[1].length : 0;
            // Base level is one level deeper than variant
            baseLevel = Math.floor(variantIndent / 2) + 1;
          }

          // Generate lines from source, inserting each as child of previous
          // nodesToInsert is now in correct order: [parent, child, grandchild] (if we matched nothing)
          // or [child, grandchild] (if we matched parent)
          // Each should be inserted one level deeper than the previous
          const linesToInsert: string[] = [];
          if (nodesToInsert.length > 0) {
            nodesToInsert.forEach((pathNode, idx) => {
              const sourceLine = lines[pathNode.lineIndex];
              if (sourceLine) {
                const match = sourceLine.match(/^(\s*)(.*)/);
                if (match) {
                  // Calculate level: baseLevel for first node, then increment by 1 for each subsequent
                  // This ensures parent-child relationships are preserved
                  const newLevel = baseLevel + idx;
                  const newIndent = ' '.repeat(newLevel * 2);
                  
                  // Preserve content and add #common# if not present
                  let content = match[2];
                  if (!content.includes('#common#')) {
                    content = content.trimEnd() + ' #common#';
                  }
                  
                  linesToInsert.push(`${newIndent}${content}`);
                }
              }
            });
          }
          
          if (linesToInsert.length > 0) {
            mutations.push({ index: insertIndex + 1, text: linesToInsert, isInsert: true });
          }
        }
      });
    }

    // Apply mutations
    mutations.sort((a, b) => b.index - a.index);
    const finalLines = [...yText.toString().split('\n')];

    mutations.forEach(m => {
      if (m.isInsert) {
        finalLines.splice(m.index, 0, ...m.text);
      } else {
        finalLines[m.index] = m.text[0];
      }
    });

    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, finalLines.join('\n'));
    });
  } else {
    // Unmark common: keep current node (remove #common# tag), delete matching path chain in OTHER variants only
    const hubInfo = findHubAndSourceVariant();
    if (!hubInfo) {
      // Not in a hub, just remove the tag
      const updatedLine = currentLine.replace(/#common#/g, '').trimEnd();
      doc.transact(() => {
        const updatedLines = [...lines];
        updatedLines[lineIndex] = updatedLine;
        yText.delete(0, yText.length);
        yText.insert(0, updatedLines.join('\n'));
      });
      return;
    }

    const { hub, sourceVariant, path } = hubInfo;
    const updatedLines = [...lines];
    
    // Remove #common# tag from current node
    updatedLines[lineIndex] = updatedLines[lineIndex].replace(/#common#/g, '').trimEnd();
    
    const indicesToRemove = new Set<number>();
    const reversedPath = [...path].reverse();

    // Search for path chain copies in other variants
    // This function recursively searches for nodes matching the path structure
    const searchPathChain = (variant: NexusNode, pathNodes: NexusNode[], currentPath: NexusNode[] = []): void => {
      if (pathNodes.length === 0) {
        // Found complete match - mark all nodes in path for removal
        currentPath.forEach(n => {
          const nodeLine = lines[n.lineIndex];
          if (nodeLine && nodeLine.includes('#common#')) {
            indicesToRemove.add(n.lineIndex);
          }
        });
        // Also remove all common children of the target node
        const lastNode = currentPath[currentPath.length - 1];
        const collectCommonChildren = (child: NexusNode) => {
          const childLine = lines[child.lineIndex];
          if (childLine && childLine.includes('#common#')) {
            indicesToRemove.add(child.lineIndex);
            child.children.forEach(collectCommonChildren);
          }
        };
        lastNode.children.forEach(collectCommonChildren);
        return;
      }

      const [nextPathNode, ...remainingPath] = pathNodes;
      // Match by content - must have same content and be marked as common
      // Use modularized content normalization utility for consistent comparison
      const nextPathContent = normalizeNodeContent(nextPathNode.content);
      
      const matchingChild = variant.children.find(c => {
        const childContent = normalizeNodeContent(c.content);
        const contentMatch = childContent === nextPathContent;
        const isCommon = hasCommonTag(lines[c.lineIndex]);
        return contentMatch && isCommon;
      });

      if (matchingChild) {
        searchPathChain(matchingChild, remainingPath, [...currentPath, matchingChild]);
      }
    };

    // Search in all other variants (not the source variant)
    if (hub.variants) {
      hub.variants.forEach(variant => {
        if (variant.id === sourceVariant.id) return; // Skip source variant
        searchPathChain(variant, reversedPath);
      });
    }

    // Never remove the current node
    indicesToRemove.delete(lineIndex);

    // Apply changes
    if (indicesToRemove.size > 0) {
      const finalFiltered: string[] = [];
      updatedLines.forEach((line, idx) => {
        if (!indicesToRemove.has(idx)) finalFiltered.push(line);
      });
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, finalFiltered.join('\n'));
      });
    } else {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, updatedLines.join('\n'));
      });
    }
  }
};
