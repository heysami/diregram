import type { SystemFlowBox, SystemFlowLink } from '../types';
import { makeSeparatorAndBlocks, renderNodeLines } from '../markdown';
import { normalizeNewlines, safeSingleLine, stripMermaidComments } from '../text';
import { layoutBoxesInGrid, makeSystemFlowState } from '../systemflow';

export function convertC4(src: string): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const lines = normalizeNewlines(src).split('\n');
  const title = 'System flow (C4)';
  type Elem = { id: string; label: string; kind: string };
  const elems: Elem[] = [];
  const elemById = new Map<string, Elem>();

  const zones: Array<{ id: string; name: string; boxKeys: string[]; outlineStyle?: 'solid' | 'dashed' | 'dotted' | 'double' }> = [];
  const zoneStack: Array<{ zoneId: string; name: string; elemIds: string[] }> = [];

  const addElem = (idRaw: string, labelRaw: string, kind: string) => {
    const id = safeSingleLine(idRaw);
    const label = safeSingleLine(labelRaw).replace(/^"|"$/g, '');
    if (!id) return;
    if (elemById.has(id)) return;
    const e: Elem = { id, label: label || id, kind };
    elems.push(e);
    elemById.set(id, e);
    if (zoneStack.length) zoneStack[zoneStack.length - 1].elemIds.push(id);
  };

  const rels: Array<{ from: string; to: string; label: string }> = [];

  for (const raw of lines.slice(1)) {
    const line = stripMermaidComments(raw).trim();
    if (!line) continue;
    const boundaryStart = line.match(/^(?:System_Boundary|Container_Boundary|Enterprise_Boundary)\(\s*([A-Za-z0-9_.$-]+)\s*,\s*"([^"]+)"\s*\)\s*\{\s*$/);
    if (boundaryStart) {
      zoneStack.push({ zoneId: boundaryStart[1], name: boundaryStart[2], elemIds: [] });
      continue;
    }
    if (line === '}') {
      const z = zoneStack.pop();
      if (z) zones.push({ id: `sfzone-${zones.length + 1}`, name: z.name, boxKeys: z.elemIds.map((id) => id) });
      continue;
    }

    const def = line.match(/^([A-Za-z0-9_]+)\(\s*([A-Za-z0-9_.$-]+)\s*,\s*"([^"]+)"(?:\s*,[\s\S]*)?\)\s*$/);
    if (def) {
      addElem(def[2], def[3], def[1]);
      continue;
    }

    const rel = line.match(/^Rel(?:_[A-Za-z]+)?\(\s*([A-Za-z0-9_.$-]+)\s*,\s*([A-Za-z0-9_.$-]+)\s*,\s*"([^"]*)"(?:\s*,[\s\S]*)?\)\s*$/);
    if (rel) {
      rels.push({ from: rel[1], to: rel[2], label: rel[3] });
      continue;
    }
  }

  if (!elems.length) return { error: 'No C4 elements detected.' };

  const boxKeyByElemId = new Map<string, string>();
  elems.forEach((e, idx) => boxKeyByElemId.set(e.id, `sfbox-${idx + 1}`));

  const layout = layoutBoxesInGrid(elems.map((e) => e.id), { startX: 2, startY: 2, boxW: 2, boxH: 2 });
  const boxes: SystemFlowBox[] = layout.map((p) => {
    const e = elemById.get(p.key)!;
    const icon = (() => {
      const k = e.kind.toLowerCase();
      if (k.includes('person')) return '🧑';
      if (k.includes('system')) return '🧩';
      if (k.includes('container')) return '📦';
      if (k.includes('component')) return '🧱';
      if (k.includes('database')) return '🗄️';
      return '⬛︎';
    })();
    return { key: boxKeyByElemId.get(e.id)!, name: e.label, icon, gridX: p.gridX, gridY: p.gridY, gridWidth: p.gridWidth, gridHeight: p.gridHeight };
  });

  const links: SystemFlowLink[] = rels
    .map((r, idx) => {
      const fromKey = boxKeyByElemId.get(r.from);
      const toKey = boxKeyByElemId.get(r.to);
      if (!fromKey || !toKey) return null;
      return { id: `sflink-${idx + 1}`, fromKey, toKey, text: r.label, order: idx + 1, dashStyle: 'solid', endShape: 'arrow' } satisfies SystemFlowLink;
    })
    .filter(Boolean) as SystemFlowLink[];

  const zones2 = zones
    .map((z) => ({
      ...z,
      boxKeys: z.boxKeys.map((eid) => boxKeyByElemId.get(eid)).filter(Boolean) as string[],
      outlineStyle: 'dashed' as const,
    }))
    .filter((z) => z.boxKeys.length > 0);

  const sfid = 'systemflow-1';
  const sf = makeSystemFlowState({ sfid, title, boxes, links, zones: zones2 });
  const md = renderNodeLines([sf.rootLine]).markdown + makeSeparatorAndBlocks(sf.blocks);
  return { title, kind: 'diagram', markdown: md };
}

