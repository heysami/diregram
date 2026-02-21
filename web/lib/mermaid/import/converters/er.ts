import type { SystemFlowBox, SystemFlowLink } from '../types';
import { makeSeparatorAndBlocks, renderNodeLines } from '../markdown';
import { normalizeNewlines, safeSingleLine, stripMermaidComments } from '../text';
import { layoutBoxesInGrid, makeSystemFlowState } from '../systemflow';

export function convertErDiagram(src: string): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const lines = normalizeNewlines(src).split('\n').slice(1);
  const entities = new Set<string>();
  type ErRel = {
    a: string;
    b: string;
    leftToken: string;
    rightToken: string;
    card: string;
    label?: string;
  };
  const rels: ErRel[] = [];

  for (const raw of lines) {
    const line = stripMermaidComments(raw).trim();
    if (!line) continue;
    const rel = line.match(/^([A-Za-z0-9_.$-]+)\s+([|o}{]{1,2})--([|o}{]{1,2})\s+([A-Za-z0-9_.$-]+)\s*(?::\s*([\s\S]*))?$/);
    if (rel) {
      const a = rel[1];
      const left = rel[2];
      const right = rel[3];
      const b = rel[4];
      const lbl = safeSingleLine(rel[5] || '');
      entities.add(a);
      entities.add(b);
      const mapSide = (s: string) => {
        if (s.includes('||')) return '1';
        if (s.includes('|')) return '1';
        if (s.includes('o')) return '0..1';
        if (s.includes('{') || s.includes('}')) return '*';
        return '?';
      };
      const card = `${mapSide(left)}:${mapSide(right)}`;
      rels.push({ a, b, leftToken: left, rightToken: right, card, ...(lbl ? { label: lbl } : null) });
      continue;
    }
    const ent = line.match(/^([A-Za-z0-9_.$-]+)\s*\{?\s*$/);
    if (ent) entities.add(ent[1]);
  }

  if (!entities.size) return { error: 'No entities detected.' };
  const names = Array.from(entities.values()).sort((a, b) => a.localeCompare(b));

  const objects = names.map((name, idx) => ({ id: `do-${idx + 1}`, name, data: { kind: 'entity' } }));
  const dataObjects = { nextId: objects.length + 1, objects };
  const doByName = new Map<string, string>();
  objects.forEach((o) => doByName.set(o.name, o.id));

  const boxKeysByName = new Map<string, string>();
  names.forEach((n, idx) => boxKeysByName.set(n, `sfbox-${idx + 1}`));
  const layout = layoutBoxesInGrid(names, { startX: 2, startY: 2, boxW: 2, boxH: 2 });
  const boxes: SystemFlowBox[] = layout.map((p) => ({
    key: boxKeysByName.get(p.key)!,
    name: p.key,
    icon: '🗃️',
    dataObjectId: doByName.get(p.key),
    gridX: p.gridX,
    gridY: p.gridY,
    gridWidth: p.gridWidth,
    gridHeight: p.gridHeight,
  }));

  const links: SystemFlowLink[] = rels.map((r, idx) => ({
    id: `sflink-${idx + 1}`,
    fromKey: boxKeysByName.get(r.a)!,
    toKey: boxKeysByName.get(r.b)!,
    text: r.label ? `${r.card} ${r.label}`.trim() : r.card,
    dashStyle: 'solid',
    endShape: 'arrow',
    order: idx + 1,
  }));

  const sfid = 'systemflow-1';
  const sf = makeSystemFlowState({ sfid, title: 'Data objects (ER diagram)', boxes, links });

  const edgeCardinality = (leftToken: string, rightToken: string) => {
    const leftMany = leftToken.includes('{') || leftToken.includes('}');
    const rightMany = rightToken.includes('{') || rightToken.includes('}');
    if (leftMany && rightMany) return { from: 'both', card: 'manyToMany' as const };
    if (!leftMany && rightMany) return { from: 'left', card: 'oneToMany' as const };
    if (leftMany && !rightMany) return { from: 'right', card: 'oneToMany' as const };
    return { from: 'left', card: 'one' as const };
  };

  const targetsByParent = new Map<string, Array<{ targetId: string; cardinality: 'one' | 'oneToMany' | 'manyToMany' }>>();
  rels.forEach((r) => {
    const c = edgeCardinality(r.leftToken, r.rightToken);
    if (c.from === 'right') {
      targetsByParent.set(r.b, [...(targetsByParent.get(r.b) || []), { targetId: r.a, cardinality: c.card }]);
      return;
    }
    targetsByParent.set(r.a, [...(targetsByParent.get(r.a) || []), { targetId: r.b, cardinality: c.card }]);
  });

  let rn = 1;
  const expandedBlocks: Array<{ type: string; body: unknown }> = [];
  targetsByParent.forEach((targets, parentName) => {
    const parentDoId = doByName.get(parentName);
    if (!parentDoId) return;
    expandedBlocks.push({ type: `expanded-metadata-${rn}`, body: { dataObjectId: parentDoId } });

    const nodes = targets
      .map((t, idx) => {
        const targetDoId = doByName.get(t.targetId);
        if (!targetDoId) return null;
        return {
          key: `grid-${rn}-${idx + 1}`,
          content: t.targetId,
          uiType: 'list',
          relationKind: 'relation',
          relationCardinality:
            t.cardinality === 'oneToMany' ? 'oneToMany' : t.cardinality === 'manyToMany' ? 'manyToMany' : 'one',
          dataObjectId: targetDoId,
          gridX: idx * 6,
          gridY: 0,
          gridWidth: 5,
          gridHeight: 2,
        };
      })
      .filter(Boolean);

    expandedBlocks.push({ type: `expanded-grid-${rn}`, body: nodes });
    rn += 1;
  });

  const md =
    renderNodeLines([sf.rootLine]).markdown +
    makeSeparatorAndBlocks([{ type: 'data-objects', body: dataObjects }, ...sf.blocks, ...expandedBlocks]);
  return { title: 'ER diagram', kind: 'diagram', markdown: md };
}

