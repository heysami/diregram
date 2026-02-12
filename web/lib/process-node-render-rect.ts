import type { FlowNodeType } from '@/components/DimensionFlowEditor';
import type { NodeLayout } from '@/lib/layout-engine';
import type { NexusNode } from '@/types/nexus';
import { NODE_WIDTH } from '@/lib/layout-engine';
import { DIAMOND_SIZE } from '@/lib/process-flow-diamond';

export type RenderedRect = { x: number; y: number; w: number; h: number };

/**
 * Compute the rendered rect for a main-canvas node, matching NexusCanvas render semantics:
 * - Diamonds (validation/branch) are centered in NODE_WIDTH and use a square size based on layout height.
 * - Time/Loop nodes reserve extra height for a top icon (+24px).
 */
export function getRenderedRectForMainCanvasNode(opts: {
  node: NexusNode;
  layout: NodeLayout;
  processNodeType?: FlowNodeType | null;
  showFlowOn: boolean;
}): RenderedRect {
  const { node, layout, processNodeType, showFlowOn } = opts;
  const isProcessNode = node.isFlowNode;

  const type = isProcessNode ? (processNodeType || 'step') : null;
  const isDiamond =
    !!isProcessNode &&
    showFlowOn &&
    !!type &&
    (type === 'validation' || type === 'branch');

  const diamondSize = isDiamond ? Math.min(NODE_WIDTH, Math.max(DIAMOND_SIZE, layout.height)) : DIAMOND_SIZE;
  const x = isDiamond ? layout.x + (layout.width - diamondSize) / 2 : layout.x;
  const y = layout.y;
  const w = isDiamond ? diamondSize : layout.width;

  const extraTopIcon = isProcessNode && (type === 'time' || type === 'loop') ? 24 : 0;
  const h = (isDiamond ? diamondSize : layout.height) + extraTopIcon;

  return { x, y, w, h };
}

