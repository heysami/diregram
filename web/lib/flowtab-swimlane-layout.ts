import type { NexusNode } from '@/types/nexus';
import type { NodeLayout } from '@/lib/layout-engine';

export type SwimlaneLayoutSpec = {
  lanes: { id: string; label: string }[];
  stages: { id: string; label: string }[];
  nodeToLaneId: Record<string, string>;
  nodeToStage: Record<string, number>;
};

export type SwimlaneBandMetrics = {
  laneGutterW: number;
  headerH: number;
  laneTops: number[];
  laneHeights: number[];
  stageLefts: number[];
  stageWidths: number[];
  stageInsetX: number;
  laneInsetY: number;
};

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Traverse a Nexus "tree" defensively.
 *
 * Notes:
 * - Hubs store `variants` including the hub node itself (see `nexus-parser`).
 * - Some call-sites expect to walk variants as well as children.
 * - Therefore we must be cycle-safe (by id) and avoid recursion (stack overflow).
 */
function traverseSwimlaneTree(root: NexusNode, fn: (node: NexusNode) => void) {
  const visited = new Set<string>();
  const stack: NexusNode[] = [root];

  while (stack.length > 0) {
    const n = stack.pop()!;
    if (!n?.id) continue;
    if (visited.has(n.id)) continue;
    visited.add(n.id);

    fn(n);

    // Depth-first: push in reverse if you care about original order; we don't here.
    for (let i = n.children.length - 1; i >= 0; i -= 1) {
      stack.push(n.children[i]);
    }

    if (n.isHub && n.variants && n.variants.length > 0) {
      for (let i = n.variants.length - 1; i >= 0; i -= 1) {
        stack.push(n.variants[i]);
      }
    }
  }
}

/**
 * Flow tab swimlane override:
 * - uses the main canvas process autolayout as the "local" positions
 * - groups nodes into explicit lane/stage bands
 * - computes dynamic band sizes based on content extents
 * - applies prefix-sum offsets + insets so nodes don't touch borders
 */
export function computeSwimlaneLayoutOverride(params: {
  baseLayout: Record<string, NodeLayout>;
  visualTree: NexusNode[];
  swimlane: SwimlaneLayoutSpec;
  nodeWidth: number;
  diamondSize: number;
}): { layout: Record<string, NodeLayout>; bands: SwimlaneBandMetrics } {
  const { baseLayout, visualTree, swimlane, nodeWidth, diamondSize } = params;

  const STAGE_MIN_W = nodeWidth + 100;
  const LANE_MIN_H = Math.max(diamondSize, 260) + 80;
  const STAGE_PAD = 120;
  const LANE_PAD = 64;
  const STAGE_INSET_X = 36;
  const LANE_INSET_Y = 24;
  const LANE_GUTTER_W = 140;
  const HEADER_H = 28;

  const laneIndexById = new Map<string, number>(swimlane.lanes.map((l, idx) => [l.id, idx]));
  const defaultLaneId = swimlane.lanes[0]?.id || 'branch-1';
  const getLaneIdx = (nodeId: string) => {
    const laneId = swimlane.nodeToLaneId[nodeId] || defaultLaneId;
    return laneIndexById.get(laneId) ?? 0;
  };
  const getStageIdx = (nodeId: string) => {
    const raw = swimlane.nodeToStage[nodeId];
    return Number.isFinite(raw) ? Math.max(0, raw) : 0;
  };

  // Determine stageCount from definitions AND any mapped nodes.
  let maxStageIdx = swimlane.stages.length - 1;
  Object.values(swimlane.nodeToStage).forEach((s) => {
    if (Number.isFinite(s)) maxStageIdx = Math.max(maxStageIdx, Math.max(0, s));
  });
  const stageCount = Math.max(1, maxStageIdx + 1);
  const laneCount = Math.max(1, swimlane.lanes.length);

  const stageBounds: Bounds[] = Array.from({ length: stageCount }).map(() => ({
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  }));
  const laneBounds: Bounds[] = Array.from({ length: laneCount }).map(() => ({
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  }));

  // Collect bounds per stage + per lane based on base autolayout positions.
  const collect = (n: NexusNode) => {
    const l = baseLayout[n.id];
    if (!l) return;
    const laneIdx = getLaneIdx(n.id);
    const stageIdx = getStageIdx(n.id);
    const x1 = l.x;
    const x2 = l.x + l.width;
    const y1 = l.y;
    const y2 = l.y + l.height;

    const sb = stageBounds[stageIdx];
    sb.minX = Math.min(sb.minX, x1);
    sb.maxX = Math.max(sb.maxX, x2);
    sb.minY = Math.min(sb.minY, y1);
    sb.maxY = Math.max(sb.maxY, y2);

    const lb = laneBounds[laneIdx];
    lb.minX = Math.min(lb.minX, x1);
    lb.maxX = Math.max(lb.maxX, x2);
    lb.minY = Math.min(lb.minY, y1);
    lb.maxY = Math.max(lb.maxY, y2);
  };
  visualTree.forEach((r) => traverseSwimlaneTree(r, collect));

  const stageWidths = stageBounds.map((b) => {
    if (b.minX === Infinity) return STAGE_MIN_W;
    return Math.max(STAGE_MIN_W, b.maxX - b.minX + STAGE_PAD + STAGE_INSET_X * 2);
  });
  const laneHeights = laneBounds.map((b) => {
    if (b.minY === Infinity) return LANE_MIN_H;
    return Math.max(LANE_MIN_H, b.maxY - b.minY + LANE_PAD + LANE_INSET_Y * 2);
  });

  const stageLefts: number[] = [];
  let accX = 0;
  for (let i = 0; i < stageCount; i++) {
    stageLefts[i] = accX;
    accX += stageWidths[i];
  }

  const laneTops: number[] = [];
  let accY = 0;
  for (let i = 0; i < laneCount; i++) {
    laneTops[i] = accY;
    accY += laneHeights[i];
  }

  // Apply prefix-sum offsets + insets, normalizing each stage/lane to start at its own min.
  const nextLayout: Record<string, NodeLayout> = { ...baseLayout };
  const apply = (n: NexusNode) => {
    const l = nextLayout[n.id];
    if (l) {
      const laneIdx = getLaneIdx(n.id);
      const stageIdx = getStageIdx(n.id);
      const sb = stageBounds[stageIdx];
      const lb = laneBounds[laneIdx];
      const localX = sb.minX === Infinity ? l.x : l.x - sb.minX;
      // Important: don't let negative minY in a lane push the entire lane content downward.
      // Deep diamond chains can pull some nodes slightly above y=0 in the base autolayout,
      // which makes `lb.minY` negative and causes an accumulating "drift down" as more
      // diamonds are added. Clamping keeps lanes stable.
      const laneY0 = lb.minY === Infinity ? 0 : Math.max(0, lb.minY);
      const localY = lb.minY === Infinity ? l.y : l.y - laneY0;
      nextLayout[n.id] = {
        ...l,
        x: localX + stageLefts[stageIdx] + STAGE_INSET_X,
        y: localY + laneTops[laneIdx] + LANE_INSET_Y,
      };
    }
  };
  visualTree.forEach((r) => traverseSwimlaneTree(r, apply));

  return {
    layout: nextLayout,
    bands: {
      laneGutterW: LANE_GUTTER_W,
      headerH: HEADER_H,
      laneTops,
      laneHeights,
      stageLefts,
      stageWidths,
      stageInsetX: STAGE_INSET_X,
      laneInsetY: LANE_INSET_Y,
    },
  };
}

