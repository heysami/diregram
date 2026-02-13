import { NexusNode } from '@/types/nexus';
import { calculateTextHeight, calculateTextHeightCustom } from './text-measurement';
import { loadExpandedNodeMetadata, ExpandedNodeMetadata } from './expanded-node-metadata';
import * as Y from 'yjs';
import {
  DIAMOND_SIZE,
  getDiamondChildStartY,
  getDiamondSubtreeExtraTop,
  getValidationSecondChildShiftY,
  isProcessFlowDiamondType,
  shiftSubtreeX,
  shiftSubtreeY,
} from './process-flow-diamond';
import type { LayoutDirection } from './layout-direction';

export interface Point {
  x: number;
  y: number;
}

export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Config
export const NODE_WIDTH = 150;
const NODE_HEIGHT_MIN = 40; // Minimum height for nodes
const GAP_X = 50; 
// Base vertical gap between sibling subtrees
const GAP_Y = 32; 
// Extra vertical space reserved around conditional hub groups so their
// visual enclosures (header + padding) have room without colliding with neighbors.
const HUB_TOP_MARGIN = 32;
const HUB_BOTTOM_MARGIN = 32;

// Icon config: icon renders above text at 3× text size (text-sm = 14px in text-measurement.ts)
const ICON_FONT_SIZE_PX = 14 * 3;
const ICON_GAP_PX = 6;
const ICON_EXTRA_HEIGHT_PX = ICON_FONT_SIZE_PX + ICON_GAP_PX;

// Annotation config (rendered OUTSIDE the node card, below it, but layout reserves space).
export const ANNOTATION_GAP_PX = 8;

/**
 * Calculates the layout for a list of root nodes (Left-to-Right tree)
 */
export function calculateTreeLayout(
  nodes: NexusNode[], 
  expandedNodes?: Set<string>, 
  doc?: Y.Doc,
  getRunningNumber?: (nodeId: string) => number | undefined,
  processFlowModeNodes?: Set<string>,
  nodeMap?: Map<string, NexusNode>,
  processNodeTypes?: Record<string, string>,
  layoutDirection: LayoutDirection = 'horizontal',
): Record<string, NodeLayout> {
  if (layoutDirection === 'vertical') {
    return calculateTreeLayoutVertical(
      nodes,
      expandedNodes,
      doc,
      getRunningNumber,
      processFlowModeNodes,
      nodeMap,
      processNodeTypes,
    );
  }

  const layout: Record<string, NodeLayout> = {};
  let currentY = 0;
  const isExpanded = (nodeId: string) => expandedNodes?.has(nodeId) ?? false;
  
  // Cache for metadata to avoid repeated parsing (keyed by running number)
  const metadataCache = new Map<number, ExpandedNodeMetadata>();
  const getMetadata = (nodeId: string): ExpandedNodeMetadata => {
    if (!doc || !getRunningNumber) {
      return { width: 4, height: 4, gridSize: 4 };
    }
    
    const runningNumber = getRunningNumber(nodeId);
    if (runningNumber === undefined) {
      return { width: 4, height: 4, gridSize: 4 };
    }
    
    if (!metadataCache.has(runningNumber)) {
      metadataCache.set(runningNumber, loadExpandedNodeMetadata(doc, runningNumber));
    }
    return metadataCache.get(runningNumber) || { width: 4, height: 4, gridSize: 4 };
  };
  
  // Track the rightmost X position at each level
  // When a node expands, it pushes both its children AND subsequent siblings to the right
  const levelMaxX: Record<number, number> = {};
  const levelMaxRightEdge: Record<number, number> = {}; // Track max right edge per level for pushing siblings

  // Recursive function to place nodes
  // Returns the total height of the subtree
  function processNode(node: NexusNode, logicalLevel: number, startY: number, accumulatedVisualOffset: number = 0, parentRightEdge?: number): number {
    // Calculate node width first to determine X position
    const expanded = isExpanded(node.id);
    const metadata = expanded ? getMetadata(node.id) : null;
    const widthMultiplier = metadata?.width || 4;
    const nodeWidth = expanded ? NODE_WIDTH * widthMultiplier : NODE_WIDTH;
    
    // Calculate X position based on level, but account for expanded parents and siblings
    const currentVisualLevel = (node.visualLevel || 0);
    const totalVisualLevel = currentVisualLevel + accumulatedVisualOffset;
    const levelKey = logicalLevel + totalVisualLevel;
    
    // Calculate base X for this level
    const baseX = levelKey * (NODE_WIDTH + GAP_X);
    
    // Determine X position
    let x: number;
    if (parentRightEdge !== undefined) {
      // Children: positioned after parent's right edge
      // But also check if any node at parent's level expanded and pushed this level
      const parentLevelKey = levelKey - 1;
      const parentLevelMaxRight = levelMaxRightEdge[parentLevelKey];
      const pushedBySibling = parentLevelMaxRight ? parentLevelMaxRight + GAP_X : undefined;
      
      // Give extra horizontal space for children that are process nodes (for connector labels)
      // Only apply extra gap when process flow mode is enabled for the root process node
      let extraGapForProcessNode = 0;
      if (node.isFlowNode && processFlowModeNodes && nodeMap) {
        // Find the root process node
        let rootProcessNode: NexusNode | null = node;
        let checkNode: NexusNode | null = node;
        while (checkNode) {
          if (checkNode.isFlowNode) {
            rootProcessNode = checkNode;
            const parentId = checkNode.parentId;
            if (!parentId) break;
            const parent = nodeMap.get(parentId);
            if (!parent || !parent.isFlowNode) break;
            checkNode = parent;
          } else {
            break;
          }
        }
        // Only apply extra gap if root process node is in process flow mode
        if (rootProcessNode && processFlowModeNodes.has(rootProcessNode.id)) {
          extraGapForProcessNode = GAP_X * 0.75; // +75% more gap for process nodes
        }
      }
      const calculatedX = parentRightEdge + GAP_X + extraGapForProcessNode;
      const finalX = pushedBySibling ? Math.max(calculatedX, pushedBySibling) : calculatedX;
      
      if (levelMaxX[levelKey] === undefined) {
        // First node at this level
        x = finalX;
        levelMaxX[levelKey] = x;
        levelMaxRightEdge[levelKey] = x + nodeWidth;
      } else {
        // Siblings share X, but use the max if pushed by expanded siblings
        x = Math.max(levelMaxX[levelKey], finalX);
        levelMaxX[levelKey] = x;
        // Update max right edge - this pushes next level
        levelMaxRightEdge[levelKey] = Math.max(levelMaxRightEdge[levelKey], x + nodeWidth);
      }
    } else {
      // Root level - siblings share the same X
      if (levelMaxX[levelKey] === undefined) {
        x = baseX;
        levelMaxX[levelKey] = x;
        levelMaxRightEdge[levelKey] = x + nodeWidth;
      } else {
        // Siblings share X
        x = levelMaxX[levelKey];
        // Update max right edge to push next level if this one expands
        levelMaxRightEdge[levelKey] = Math.max(levelMaxRightEdge[levelKey], x + nodeWidth);
      }
    }
    
    // Calculate the right edge of this node (for positioning children)
    const rightEdge = x + nodeWidth;

    // Determine process-flow state + diamond-ness early so sizing logic can use it.
    // (These values are also used later for child positioning.)
    let isProcessFlowModeEnabled = false;
    if (node.isFlowNode && processFlowModeNodes && nodeMap) {
      // Find the root process node
      let rootProcessNode: NexusNode | null = node;
      let checkNode: NexusNode | null = node;
      while (checkNode) {
        if (checkNode.isFlowNode) {
          rootProcessNode = checkNode;
          const parentId = checkNode.parentId;
          if (!parentId) break;
          const parent = nodeMap.get(parentId);
          if (!parent || !parent.isFlowNode) break;
          checkNode = parent;
        } else {
          break;
        }
      }
      if (rootProcessNode && processFlowModeNodes.has(rootProcessNode.id)) {
        isProcessFlowModeEnabled = true;
      }
    }

    const nodeType = processNodeTypes?.[node.id];
    const isDiamond = isProcessFlowDiamondType(nodeType);
    
    // Calculate actual height needed for text content
    // Calculate text height with normal width first, then scale
    const iconExtra = node.icon && node.icon.trim().length ? ICON_EXTRA_HEIGHT_PX : 0;
    let baseCardHeight: number;
    if (isDiamond && isProcessFlowModeEnabled) {
      // Diamonds render inside a clipped square (default ~DIAMOND_SIZE wide), so using NODE_WIDTH
      // underestimates wrapping and yields a height that's too small (text clips).
      //
      // We compute a "rendered" square size that can grow (capped to NODE_WIDTH so we don't
      // exceed the horizontally-reserved layout width).
      let size = DIAMOND_SIZE;
      for (let i = 0; i < 2; i += 1) {
        const textH = calculateTextHeight(node.content, size);
        const cardH = Math.max(NODE_HEIGHT_MIN, textH + iconExtra);
        const next = Math.min(NODE_WIDTH, Math.max(DIAMOND_SIZE, cardH));
        if (next === size) break;
        size = next;
      }
      baseCardHeight = size;
    } else {
      const baseTextHeight = calculateTextHeight(node.content, NODE_WIDTH);
      baseCardHeight = Math.max(NODE_HEIGHT_MIN, baseTextHeight + iconExtra);
    }
    const diamondGeometrySizePx = isDiamond && isProcessFlowModeEnabled ? baseCardHeight : DIAMOND_SIZE;
    
    // Scale by custom multiplier when expanded
    const heightMultiplier = metadata?.height || 4;
    const nodeHeight = expanded ? baseCardHeight * heightMultiplier : baseCardHeight;

    // Annotation is rendered outside the node, but we reserve vertical space so siblings don’t overlap.
    const annotationReserve =
      node.annotation && node.annotation.trim().length
        ? ANNOTATION_GAP_PX +
          calculateTextHeightCustom({
            text: node.annotation,
            boxWidth: nodeWidth,
            paddingX: 12,
            paddingY: 0,
            fontSizePx: 11,
            fontWeight: 400,
            lineHeight: 1.35,
          })
        : 0;

    // If leaf node
    if (node.children.length === 0) {
      // Even leaf hubs need extra vertical space so their dotted group
      // background (with header + padding) doesn't collide with siblings.
      const extraTop = node.isHub ? HUB_TOP_MARGIN : 0;
      const extraBottom = node.isHub ? HUB_BOTTOM_MARGIN : 0;

      layout[node.id] = {
        id: node.id,
        x,
        // Shift the node down by extraTop so the free space sits *above* it.
        y: startY + extraTop,
        width: nodeWidth,
        height: nodeHeight
      };

      // Height of this subtree now includes top + bottom margins.
      return extraTop + nodeHeight + annotationReserve + GAP_Y + extraBottom;
    }

    // Process children
    // For process nodes, only use hub margins when process flow mode is enabled
    // When flow mode is off, use compact spacing like regular nodes
    let topMargin = node.isHub ? HUB_TOP_MARGIN : 0;
    let bottomMargin = node.isHub ? HUB_BOTTOM_MARGIN : 0;
    
    // For process nodes when flow mode is OFF, don't use hub margins (use compact spacing)
    if (node.isFlowNode && !isProcessFlowModeEnabled) {
      topMargin = 0;
      bottomMargin = 0;
    }

    let childrenTotalHeight = 0;
    let childStartY = getDiamondChildStartY({
      startY,
      topMargin,
      isDiamond,
      isProcessFlowModeEnabled,
      hasChildren: node.children.length > 0,
      diamondSizePx: diamondGeometrySizePx,
    });

    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i];
      const childHeight = processNode(
        child,
        logicalLevel + 1,
        childStartY,
        totalVisualLevel,
        rightEdge,
      );

      childStartY += childHeight;
      childrenTotalHeight += childHeight;
    }

    // Calculate the vertical position of the parent node
    // Default: center parent vertically relative to children
    const childrenMidY = childrenTotalHeight > 0 
      ? startY + topMargin + (childrenTotalHeight - GAP_Y) / 2
      : startY + topMargin;
    
    // For process nodes (both when flow mode is ON and OFF), align the parent
    // to the top of its subtree. This keeps vertical spacing compact and avoids
    // overlapping siblings when flow mode is off (children are visually hidden
    // but still take space in layout).
    //
    // Diamonds used to be positioned relative to their first child, but that creates
    // compounding vertical drift in deep diamond chains (each additional diamond can
    // introduce another ~diamondSize step depending on child geometry).
    // To keep placement independent per diamond, we anchor diamonds to the subtree top too.
    let nodeY: number;
    nodeY = node.isFlowNode ? startY + topMargin : childrenMidY;
    
    layout[node.id] = {
      id: node.id,
      x,
      y: nodeY, 
      width: nodeWidth,
      height: nodeHeight
    };

    // Validation diamonds: ensure 2nd child (No) is low enough so it aligns with the diamond bottom corner.
    // Apply this once per validation diamond AFTER we know the parent diamond's own Y.
    if (isDiamond && isProcessFlowModeEnabled && nodeType === 'validation' && node.children.length >= 2) {
      const noChild = node.children[1];
      const noLayout = layout[noChild.id];
      if (noLayout) {
        // Always align the NO child's VISUAL CENTER to the parent's bottom vertex.
        // If we align a diamond child's *top* to the bottom vertex, it introduces a full
        // `diamondSize` step and looks like each additional diamond drops by another diamond.
        const noCenterY = noLayout.y + noLayout.height / 2;

        // Parent diamond bottom vertex (layout.y is top of bbox; bottom vertex is +size).
        const desiredNoCenterY = nodeY + diamondGeometrySizePx;
        const delta = Math.max(0, desiredNoCenterY - noCenterY);
        if (delta > 0) {
          shiftSubtreeY(layout, noChild, delta);
          childrenTotalHeight += delta;
        }
      }
    }
    
    // Return the total height of this subtree
    // When height increases, this will push subsequent siblings down
    if (childrenTotalHeight > 0) {
      // For process nodes when flow mode is OFF, use compact spacing
      // Children are hidden but still need layout space, so we use a more compact calculation
      if (node.isFlowNode && !isProcessFlowModeEnabled) {
        // When flow mode is off, process nodes should use minimal vertical space
        // Use the node's own height plus gap, ignoring the full children span
        // This creates compact spacing like regular nodes
        return nodeHeight + annotationReserve + GAP_Y;
      }
      
      // For nodes with children, calculate the full vertical span:
      // - Children span from startY + topMargin to startY + topMargin + childrenTotalHeight
      // - Node is positioned at nodeY and has height nodeHeight
      // - For diamond nodes, node extends above nodeY by ~diamondSize/2 (space for top corner alignment)
      // - Node spans from (nodeY - diamondSize/2) to nodeY + nodeHeight
      // We need the maximum extent of both
      const diamondExtraTopSpace = getDiamondSubtreeExtraTop({
        isDiamond,
        isProcessFlowModeEnabled,
        diamondSizePx: diamondGeometrySizePx,
      });
      const subtreeTop = Math.min(startY + topMargin, nodeY - diamondExtraTopSpace);
      const subtreeBottomFromChildren = startY + topMargin + childrenTotalHeight;
      const subtreeBottomFromNode = nodeY + nodeHeight + annotationReserve;
      
      // The subtree bottom is the maximum of children bottom and node bottom
      const subtreeBottom = Math.max(subtreeBottomFromChildren, subtreeBottomFromNode);
      
      // Total height = (bottom - top) + bottom margin + gap for next sibling
      return (subtreeBottom - subtreeTop) + bottomMargin + GAP_Y;
    } else {
      // Leaf node: return node height + margins + gap
      // For process nodes when flow mode is OFF, don't use margins
      if (node.isFlowNode && !isProcessFlowModeEnabled) {
        return nodeHeight + annotationReserve + GAP_Y;
      }
      return topMargin + nodeHeight + annotationReserve + GAP_Y + bottomMargin;
    }
  }

  // Process all roots
  nodes.forEach(root => {
    const treeHeight = processNode(root, 0, currentY);
    currentY += treeHeight;
  });

  return layout;
}

/**
 * Vertical-down tree layout:
 * - Children grow downward (increasing Y).
 * - Siblings stack left-to-right (increasing X).
 *
 * This mirrors the horizontal layout but swaps the stacking axis and
 * applies "expanded node pushes next level" logic along Y (height).
 */
function calculateTreeLayoutVertical(
  nodes: NexusNode[],
  expandedNodes?: Set<string>,
  doc?: Y.Doc,
  getRunningNumber?: (nodeId: string) => number | undefined,
  processFlowModeNodes?: Set<string>,
  nodeMap?: Map<string, NexusNode>,
  processNodeTypes?: Record<string, string>,
): Record<string, NodeLayout> {
  const layout: Record<string, NodeLayout> = {};
  let currentX = 0;
  const isExpanded = (nodeId: string) => expandedNodes?.has(nodeId) ?? false;

  const metadataCache = new Map<number, ExpandedNodeMetadata>();
  const getMetadata = (nodeId: string): ExpandedNodeMetadata => {
    if (!doc || !getRunningNumber) {
      return { width: 4, height: 4, gridSize: 4 };
    }

    const runningNumber = getRunningNumber(nodeId);
    if (runningNumber === undefined) {
      return { width: 4, height: 4, gridSize: 4 };
    }

    if (!metadataCache.has(runningNumber)) {
      metadataCache.set(runningNumber, loadExpandedNodeMetadata(doc, runningNumber));
    }
    return metadataCache.get(runningNumber) || { width: 4, height: 4, gridSize: 4 };
  };

  // Track the lowest Y position at each depth
  // When a node expands (taller), it pushes both its children AND subsequent siblings downward.
  const levelMaxY: Record<number, number> = {};
  const levelMaxBottomEdge: Record<number, number> = {};

  // Depth step baseline. Tall nodes will push the next level further down via `levelMaxBottomEdge`.
  const LEVEL_Y_STEP = DIAMOND_SIZE + GAP_Y;

  function processNode(
    node: NexusNode,
    logicalLevel: number,
    startX: number,
    accumulatedVisualOffset: number = 0,
    parentBottomEdge?: number,
  ): number {
    const expanded = isExpanded(node.id);
    const metadata = expanded ? getMetadata(node.id) : null;
    const widthMultiplier = metadata?.width || 4;
    const nodeWidth = expanded ? NODE_WIDTH * widthMultiplier : NODE_WIDTH;

    const currentVisualLevel = (node.visualLevel || 0);
    const totalVisualLevel = currentVisualLevel + accumulatedVisualOffset;
    const levelKey = logicalLevel + totalVisualLevel;

    const baseY = levelKey * LEVEL_Y_STEP;

    let y: number;
    if (parentBottomEdge !== undefined) {
      const parentLevelKey = levelKey - 1;
      const parentLevelMaxBottom = levelMaxBottomEdge[parentLevelKey];
      const pushedBySibling = parentLevelMaxBottom ? parentLevelMaxBottom + GAP_Y : undefined;

      // Give extra vertical space for children that are process nodes (for connector labels).
      let extraGapForProcessNode = 0;
      if (node.isFlowNode && processFlowModeNodes && nodeMap) {
        let rootProcessNode: NexusNode | null = node;
        let checkNode: NexusNode | null = node;
        while (checkNode) {
          if (checkNode.isFlowNode) {
            rootProcessNode = checkNode;
            const parentId = checkNode.parentId;
            if (!parentId) break;
            const parent = nodeMap.get(parentId);
            if (!parent || !parent.isFlowNode) break;
            checkNode = parent;
          } else {
            break;
          }
        }
        if (rootProcessNode && processFlowModeNodes.has(rootProcessNode.id)) {
          extraGapForProcessNode = GAP_Y * 0.75;
        }
      }

      const calculatedY = parentBottomEdge + GAP_Y + extraGapForProcessNode;
      const finalY = pushedBySibling ? Math.max(calculatedY, pushedBySibling) : calculatedY;

      if (levelMaxY[levelKey] === undefined) {
        y = finalY;
        levelMaxY[levelKey] = y;
      } else {
        y = Math.max(levelMaxY[levelKey], finalY);
        levelMaxY[levelKey] = y;
      }
    } else {
      if (levelMaxY[levelKey] === undefined) {
        y = baseY;
        levelMaxY[levelKey] = y;
      } else {
        y = levelMaxY[levelKey];
      }
    }

    // Determine process-flow state + diamond-ness early so sizing logic can use it.
    let isProcessFlowModeEnabled = false;
    if (node.isFlowNode && processFlowModeNodes && nodeMap) {
      let rootProcessNode: NexusNode | null = node;
      let checkNode: NexusNode | null = node;
      while (checkNode) {
        if (checkNode.isFlowNode) {
          rootProcessNode = checkNode;
          const parentId = checkNode.parentId;
          if (!parentId) break;
          const parent = nodeMap.get(parentId);
          if (!parent || !parent.isFlowNode) break;
          checkNode = parent;
        } else {
          break;
        }
      }
      if (rootProcessNode && processFlowModeNodes.has(rootProcessNode.id)) {
        isProcessFlowModeEnabled = true;
      }
    }

    const nodeType = processNodeTypes?.[node.id];
    const isDiamond = isProcessFlowDiamondType(nodeType);

    const iconExtra = node.icon && node.icon.trim().length ? ICON_EXTRA_HEIGHT_PX : 0;
    let baseCardHeight: number;
    if (isDiamond && isProcessFlowModeEnabled) {
      let size = DIAMOND_SIZE;
      for (let i = 0; i < 2; i += 1) {
        const textH = calculateTextHeight(node.content, size);
        const cardH = Math.max(NODE_HEIGHT_MIN, textH + iconExtra);
        const next = Math.min(NODE_WIDTH, Math.max(DIAMOND_SIZE, cardH));
        if (next === size) break;
        size = next;
      }
      baseCardHeight = size;
    } else {
      const baseTextHeight = calculateTextHeight(node.content, NODE_WIDTH);
      baseCardHeight = Math.max(NODE_HEIGHT_MIN, baseTextHeight + iconExtra);
    }
    const diamondGeometrySizePx = isDiamond && isProcessFlowModeEnabled ? baseCardHeight : DIAMOND_SIZE;

    const heightMultiplier = metadata?.height || 4;
    const nodeHeight = expanded ? baseCardHeight * heightMultiplier : baseCardHeight;

    const annotationReserve =
      node.annotation && node.annotation.trim().length
        ? ANNOTATION_GAP_PX +
          calculateTextHeightCustom({
            text: node.annotation,
            boxWidth: nodeWidth,
            paddingX: 12,
            paddingY: 0,
            fontSizePx: 11,
            fontWeight: 400,
            lineHeight: 1.35,
          })
        : 0;

    // Annotations render below the node card, so they must push the next level down too.
    const effectiveHeightForSpacing = nodeHeight + annotationReserve;

    // Ensure expanded/tall nodes push later levels down.
    levelMaxBottomEdge[levelKey] = Math.max(levelMaxBottomEdge[levelKey] || -Infinity, y + effectiveHeightForSpacing);

    // Leaf
    if (node.children.length === 0) {
      // Horizontal margins for hubs (siblings stack along X in vertical mode).
      const extraLeft = node.isHub ? HUB_TOP_MARGIN : 0;
      const extraRight = node.isHub ? HUB_BOTTOM_MARGIN : 0;

      layout[node.id] = {
        id: node.id,
        x: startX + extraLeft,
        y,
        width: nodeWidth,
        height: nodeHeight,
      };

      return extraLeft + nodeWidth + GAP_X + extraRight;
    }

    // Non-leaf: process children
    let leftMargin = node.isHub ? HUB_TOP_MARGIN : 0;
    let rightMargin = node.isHub ? HUB_BOTTOM_MARGIN : 0;

    if (node.isFlowNode && !isProcessFlowModeEnabled) {
      leftMargin = 0;
      rightMargin = 0;
    }

    let childrenTotalWidth = 0;
    let childStartX = startX + leftMargin;

    const bottomEdge = y + effectiveHeightForSpacing;
    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i];
      const childWidth = processNode(child, logicalLevel + 1, childStartX, totalVisualLevel, bottomEdge);
      childStartX += childWidth;
      childrenTotalWidth += childWidth;
    }

    const childrenMidX =
      childrenTotalWidth > 0 ? startX + leftMargin + (childrenTotalWidth - GAP_X) / 2 : startX + leftMargin;

    const nodeX = node.isFlowNode ? startX + leftMargin : childrenMidX;

    layout[node.id] = {
      id: node.id,
      x: nodeX,
      y,
      width: nodeWidth,
      height: nodeHeight,
    };

    // Validation diamonds in vertical mode: ensure 2nd child (No) is far enough right so it aligns with the diamond right corner.
    if (isDiamond && isProcessFlowModeEnabled && nodeType === 'validation' && node.children.length >= 2) {
      const noChild = node.children[1];
      const noLayout = layout[noChild.id];
      if (noLayout) {
        const noCenterX = noLayout.x + noLayout.width / 2;
        const desiredNoCenterX = nodeX + diamondGeometrySizePx;
        const delta = Math.max(0, desiredNoCenterX - noCenterX);
        if (delta > 0) {
          shiftSubtreeX(layout, noChild, delta);
          childrenTotalWidth += delta;
        }
      }
    }

    if (childrenTotalWidth > 0) {
      if (node.isFlowNode && !isProcessFlowModeEnabled) {
        return nodeWidth + GAP_X;
      }

      const subtreeLeft = startX + leftMargin;
      const subtreeRightFromChildren = startX + leftMargin + childrenTotalWidth;
      const subtreeRightFromNode = nodeX + nodeWidth;
      const subtreeRight = Math.max(subtreeRightFromChildren, subtreeRightFromNode);

      return (subtreeRight - subtreeLeft) + rightMargin + GAP_X;
    }

    if (node.isFlowNode && !isProcessFlowModeEnabled) {
      return nodeWidth + GAP_X;
    }

    return leftMargin + nodeWidth + GAP_X + rightMargin;
  }

  nodes.forEach((root) => {
    const treeWidth = processNode(root, 0, currentX);
    currentX += treeWidth;
  });

  return layout;
}
