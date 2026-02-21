import type { SystemFlowBox, SystemFlowLink } from '../types';
import { makeSeparatorAndBlocks, renderNodeLines } from '../markdown';
import { parseFlowchartEdges } from '../flowchart';
import { layoutBoxesInGrid, makeSystemFlowState } from '../systemflow';

export function convertBlockLikeSystemFlow(
  src: string,
  title: string,
): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const { nodes, edges } = parseFlowchartEdges(src);
  if (!nodes.size) return { error: 'No nodes detected.' };

  const ids = Array.from(nodes.keys());
  const boxKeysById = new Map<string, string>();
  ids.forEach((id, idx) => boxKeysById.set(id, `sfbox-${idx + 1}`));

  const layout = layoutBoxesInGrid(ids, { boxW: 2, boxH: 2, colGap: 1, rowGap: 1, startX: 2, startY: 2 });
  const boxes: SystemFlowBox[] = layout.map((p) => {
    const n = nodes.get(p.key)!;
    return {
      key: boxKeysById.get(p.key)!,
      name: n.label || n.id,
      icon: '⬛︎',
      gridX: p.gridX,
      gridY: p.gridY,
      gridWidth: p.gridWidth,
      gridHeight: p.gridHeight,
    };
  });

  const links: SystemFlowLink[] = edges
    .map((e, idx) => {
      const fromKey = boxKeysById.get(e.from);
      const toKey = boxKeysById.get(e.to);
      if (!fromKey || !toKey) return null;
      return {
        id: `sflink-${idx + 1}`,
        fromKey,
        toKey,
        text: e.label,
        order: idx + 1,
        dashStyle: e.dashed ? 'dashed' : 'solid',
        endShape: 'arrow',
      } satisfies SystemFlowLink;
    })
    .filter(Boolean) as SystemFlowLink[];

  const sfid = 'systemflow-1';
  const sf = makeSystemFlowState({ sfid, title, boxes, links });
  const md = renderNodeLines([sf.rootLine]).markdown + makeSeparatorAndBlocks(sf.blocks);
  return { title, kind: 'diagram', markdown: md };
}

