import type { NodeLine, SystemFlowBox, SystemFlowLink } from './types';
import { clamp } from './math';

export function makeSystemFlowState(opts: {
  sfid: string;
  title: string;
  boxes: SystemFlowBox[];
  links: SystemFlowLink[];
  zones?: Array<{ id: string; name: string; boxKeys: string[]; outlineStyle?: 'solid' | 'dashed' | 'dotted' | 'double' }>;
}): { rootLine: NodeLine; blocks: Array<{ type: string; body: unknown }> } {
  const { sfid, title, boxes, links, zones } = opts;
  const gridWidth = clamp(Math.max(24, ...boxes.map((b) => b.gridX + b.gridWidth + 2)), 1, 200);
  const gridHeight = clamp(Math.max(24, ...boxes.map((b) => b.gridY + b.gridHeight + 2)), 1, 200);
  const state = {
    version: 1,
    gridWidth,
    gridHeight,
    boxes: boxes.map((b) => ({
      key: b.key,
      name: b.name,
      ...(b.icon ? { icon: b.icon } : null),
      ...(b.dataObjectId ? { dataObjectId: b.dataObjectId } : null),
      gridX: b.gridX,
      gridY: b.gridY,
      gridWidth: b.gridWidth,
      gridHeight: b.gridHeight,
    })),
    zones: (zones || []).map((z) => ({
      id: z.id,
      name: z.name,
      boxKeys: z.boxKeys,
      ...(z.outlineStyle ? { outlineStyle: z.outlineStyle } : null),
    })),
    links: links.map((l) => ({
      id: l.id,
      fromKey: l.fromKey,
      toKey: l.toKey,
      ...(l.text ? { text: l.text } : null),
      ...(typeof l.order === 'number' ? { order: l.order } : null),
      ...(l.dashStyle ? { dashStyle: l.dashStyle } : null),
      ...(l.startShape ? { startShape: l.startShape } : null),
      ...(l.endShape ? { endShape: l.endShape } : null),
    })),
  };
  return {
    rootLine: { indent: 0, content: `${title} #systemflow# <!-- sfid:${sfid} -->` },
    blocks: [{ type: `systemflow-${sfid}`, body: state }],
  };
}

export function layoutBoxesInGrid(
  keys: string[],
  opts?: { startX?: number; startY?: number; colGap?: number; rowGap?: number; boxW?: number; boxH?: number },
) {
  const boxW = opts?.boxW ?? 2;
  const boxH = opts?.boxH ?? 2;
  const colGap = opts?.colGap ?? 1;
  const rowGap = opts?.rowGap ?? 1;
  const startX = opts?.startX ?? 1;
  const startY = opts?.startY ?? 1;
  const cols = Math.max(1, Math.ceil(Math.sqrt(keys.length)));
  return keys.map((k, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      key: k,
      gridX: startX + col * (boxW + colGap),
      gridY: startY + row * (boxH + rowGap),
      gridWidth: boxW,
      gridHeight: boxH,
    };
  });
}

