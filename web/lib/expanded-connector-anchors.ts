import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import type { FlowNodeType } from '@/components/DimensionFlowEditor';
import { DIAMOND_SIZE } from '@/lib/process-flow-diamond';
import { loadExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import { loadExpandedGridNodesFromDoc } from '@/lib/expanded-grid-storage';
import { getIncomingConnectionPoint } from '@/lib/connector-points';
import { getExitPointOnRectBorder, type Point, type Rect } from '@/lib/geometry';

export type NodeLayoutLike = { x: number; y: number; width: number; height: number };

export type ExpandedInnerAnchorMap = Map<string, Point>; // key = `${parentId}__${dataObjectId}`

export function buildExpandedInnerAnchorLookup(opts: {
  doc: Y.Doc;
  expandedNodes: Set<string>;
  animatedLayout: Record<string, NodeLayoutLike | undefined>;
  getRunningNumber: (nodeId: string) => number | undefined;
  // Rendering constants to match the expanded grid rendering
  nodePaddingPx?: { x: number; y: number };
  gridGapPx?: number;
}): ExpandedInnerAnchorMap {
  const {
    doc,
    expandedNodes,
    animatedLayout,
    getRunningNumber,
    nodePaddingPx = { x: 12, y: 8 }, // px-3 py-2
    gridGapPx = 2,
  } = opts;

  const map: ExpandedInnerAnchorMap = new Map();

  expandedNodes.forEach((parentId) => {
    const parentLayout = animatedLayout[parentId];
    if (!parentLayout) return;
    const runningNumber = getRunningNumber(parentId);
    if (runningNumber === undefined) return;

    const metadata = loadExpandedNodeMetadata(doc, runningNumber);
    const cols = metadata.gridWidth ?? metadata.gridSize ?? 4;
    const rows = metadata.gridHeight ?? metadata.gridSize ?? 4;
    if (cols <= 0 || rows <= 0) return;

    const contentW = Math.max(1, parentLayout.width - nodePaddingPx.x * 2);
    const contentH = Math.max(1, parentLayout.height - nodePaddingPx.y * 2);
    const cellW = (contentW - (cols - 1) * gridGapPx) / cols;
    const cellH = (contentH - (rows - 1) * gridGapPx) / rows;

    const contentX0 = parentLayout.x + nodePaddingPx.x;
    const contentY0 = parentLayout.y + nodePaddingPx.y;

    const loaded = loadExpandedGridNodesFromDoc(doc, runningNumber, parentId);
    loaded.nodes.forEach((gn) => {
      const doid = (gn.sourceChildDataObjectId || gn.dataObjectId || '').trim();
      if (!doid) return;

      const left = contentX0 + gn.gridX * (cellW + gridGapPx);
      const top = contentY0 + gn.gridY * (cellH + gridGapPx);
      const w = gn.gridWidth * cellW + (gn.gridWidth - 1) * gridGapPx;
      const h = gn.gridHeight * cellH + (gn.gridHeight - 1) * gridGapPx;

      // Anchor at right edge midpoint of the inner node.
      map.set(`${parentId}__${doid}`, { x: left + w, y: top + h / 2 });
    });
  });

  return map;
}

export type ExpandedConnectorStub = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  highlight: boolean;
};

export function computeExpandedConnectorStubs(opts: {
  flattenedNodes: NexusNode[];
  expandedNodes: Set<string>;
  animatedLayout: Record<string, NodeLayoutLike | undefined>;
  processNodeTypes: Record<string, FlowNodeType | undefined>;
  anchorsByParentAndDoId: ExpandedInnerAnchorMap;
  selectedNodeId: string | null;
  dropTargetId: string | null;
}): ExpandedConnectorStub[] {
  const {
    flattenedNodes,
    expandedNodes,
    animatedLayout,
    processNodeTypes,
    anchorsByParentAndDoId,
    selectedNodeId,
    dropTargetId,
  } = opts;

  const stubs: ExpandedConnectorStub[] = [];

  flattenedNodes.forEach((node) => {
    if (!node.parentId) return;
    if (!expandedNodes.has(node.parentId)) return;
    if (!node.dataObjectId) return;

    const parentLayout = animatedLayout[node.parentId];
    const childLayout = animatedLayout[node.id];
    if (!parentLayout || !childLayout) return;

    const anchor = anchorsByParentAndDoId.get(`${node.parentId}__${node.dataObjectId}`);
    if (!anchor) return;

    const childType = processNodeTypes[node.id];
    const childIsDiamond = childType === 'validation' || childType === 'branch';
    const childDiamondSize = childIsDiamond ? Math.min(childLayout.width, Math.max(DIAMOND_SIZE, childLayout.height)) : DIAMOND_SIZE;
    const childX = childIsDiamond ? childLayout.x + (childLayout.width - childDiamondSize) / 2 : childLayout.x;
    const childY = childLayout.y;
    const endPoint = getIncomingConnectionPoint(
      childType,
      childX,
      childY,
      childIsDiamond ? childDiamondSize : childLayout.width,
      childIsDiamond ? childDiamondSize : childLayout.height,
    );

    const exit = getExitPointOnRectBorder(
      { x: parentLayout.x, y: parentLayout.y, width: parentLayout.width, height: parentLayout.height } satisfies Rect,
      anchor,
      endPoint,
    );
    if (!exit) return;

    const highlight = selectedNodeId === node.id || dropTargetId === node.id;
    stubs.push({
      key: `${node.parentId}-${node.id}-stub`,
      x1: anchor.x,
      y1: anchor.y,
      x2: exit.x,
      y2: exit.y,
      highlight,
    });
  });

  return stubs;
}

export function reattachStartToExpandedBorder(opts: {
  parentId: string;
  parentLayout: NodeLayoutLike;
  end: Point;
  childDataObjectId?: string;
  expandedNodes: Set<string>;
  anchorsByParentAndDoId: ExpandedInnerAnchorMap;
}): Point | null {
  const { parentId, parentLayout, end, childDataObjectId, expandedNodes, anchorsByParentAndDoId } = opts;
  if (!expandedNodes.has(parentId)) return null;
  const doid = (childDataObjectId || '').trim();
  if (!doid) return null;
  const anchor = anchorsByParentAndDoId.get(`${parentId}__${doid}`);
  if (!anchor) return null;
  const exit = getExitPointOnRectBorder(
    { x: parentLayout.x, y: parentLayout.y, width: parentLayout.width, height: parentLayout.height },
    anchor,
    end,
  );
  return exit || anchor;
}

