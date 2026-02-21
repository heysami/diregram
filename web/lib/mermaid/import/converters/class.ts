import type { SystemFlowBox, SystemFlowLink } from '../types';
import { makeSeparatorAndBlocks, renderNodeLines } from '../markdown';
import { normalizeNewlines, stripMermaidComments } from '../text';
import { layoutBoxesInGrid, makeSystemFlowState } from '../systemflow';

export function convertClassDiagram(src: string): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const lines = normalizeNewlines(src).split('\n').slice(1);
  const classNames = new Set<string>();

  type ClassRel = {
    a: string;
    b: string;
    op: string;
    dashed: boolean;
    kind: 'inheritance' | 'composition' | 'aggregation' | 'association' | 'realization';
  };
  const rels: ClassRel[] = [];

  const isId = (s: string) => /^[A-Za-z0-9_.$-]+$/.test(s);
  const parseRel = (rawLine: string): ClassRel | null => {
    const line0 = stripMermaidComments(rawLine).trim();
    if (!line0) return null;
    const line = line0.replace(/\s*:\s*[\s\S]*$/, '').trim();
    const noQuotes = line.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim();
    const toks = noQuotes.split(' ').filter(Boolean);
    if (toks.length < 3) return null;
    const a = toks[0];
    const b = toks[toks.length - 1];
    if (!isId(a) || !isId(b)) return null;
    const op = toks.slice(1, toks.length - 1).join('').trim();
    if (!/[.\-<>|*o]/.test(op)) return null;
    const dashed = op.includes('.') || op.includes('..') || op.includes('-.');
    const kind: ClassRel['kind'] = (() => {
      if (op.includes('<|') || op.includes('|>')) return dashed ? 'realization' : 'inheritance';
      if (op.includes('*')) return 'composition';
      if (op.includes('o')) return 'aggregation';
      if (op.includes('>') || op.includes('<')) return 'association';
      return 'association';
    })();
    return { a, b, op, dashed, kind };
  };

  for (const raw of lines) {
    const line = stripMermaidComments(raw).trim();
    if (!line) continue;
    const cls = line.match(/^(class)\s+([A-Za-z0-9_.$-]+)/i);
    if (cls) {
      classNames.add(cls[2]);
      continue;
    }
    const rel = parseRel(raw);
    if (rel) {
      classNames.add(rel.a);
      classNames.add(rel.b);
      rels.push(rel);
    }
  }
  if (!classNames.size) return { error: 'No classes detected.' };

  const names = Array.from(classNames.values()).sort((a, b) => a.localeCompare(b));

  const boxKeysByName = new Map<string, string>();
  names.forEach((n, idx) => boxKeysByName.set(n, `sfbox-${idx + 1}`));
  const layout = layoutBoxesInGrid(names, { startX: 2, startY: 2, boxW: 2, boxH: 2 });
  const boxes: SystemFlowBox[] = layout.map((p) => ({
    key: boxKeysByName.get(p.key)!,
    name: p.key,
    icon: '📦',
    gridX: p.gridX,
    gridY: p.gridY,
    gridWidth: p.gridWidth,
    gridHeight: p.gridHeight,
  }));

  const links: SystemFlowLink[] = rels
    .map((r, idx) => {
      const aKey = boxKeysByName.get(r.a);
      const bKey = boxKeysByName.get(r.b);
      if (!aKey || !bKey) return null;

      let fromKey = aKey;
      let toKey = bKey;

      const hasLeftArrow = r.op.includes('<') && !r.op.includes('>');
      const hasRightArrow = r.op.includes('>') && !r.op.includes('<');
      if (hasLeftArrow) {
        fromKey = bKey;
        toKey = aKey;
      } else if (hasRightArrow) {
        fromKey = aKey;
        toKey = bKey;
      }

      let dashStyle: 'solid' | 'dashed' = r.dashed ? 'dashed' : 'solid';
      let startShape: SystemFlowLink['startShape'] = 'none';
      let endShape: SystemFlowLink['endShape'] = 'none';

      if (r.kind === 'inheritance') {
        dashStyle = 'solid';
        endShape = 'arrow';
      } else if (r.kind === 'realization') {
        dashStyle = 'dashed';
        endShape = 'arrow';
      } else if (r.kind === 'association') {
        endShape = 'arrow';
      } else if (r.kind === 'composition' || r.kind === 'aggregation') {
        const shape: SystemFlowLink['startShape'] = r.kind === 'composition' ? 'square' : 'circle';
        const pos = r.op.indexOf(r.kind === 'composition' ? '*' : 'o');
        if (pos !== -1 && pos < r.op.length / 2) startShape = shape;
        else endShape = shape;
      }

      return { id: `sflink-${idx + 1}`, fromKey, toKey, dashStyle, startShape, endShape } satisfies SystemFlowLink;
    })
    .filter(Boolean) as SystemFlowLink[];

  const sfid = 'systemflow-1';
  const sf = makeSystemFlowState({ sfid, title: 'System flow (class diagram)', boxes, links });
  const md = renderNodeLines([sf.rootLine]).markdown + makeSeparatorAndBlocks(sf.blocks);
  return { title: 'System flow (class diagram)', kind: 'diagram', markdown: md };
}

