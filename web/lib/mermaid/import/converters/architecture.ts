import type { SystemFlowBox, SystemFlowLink } from '../types';
import { makeSeparatorAndBlocks, renderNodeLines } from '../markdown';
import { normalizeNewlines, safeSingleLine, stripMermaidComments } from '../text';
import { layoutBoxesInGrid, makeSystemFlowState } from '../systemflow';

export function convertArchitectureDiagram(src: string): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const lines = normalizeNewlines(src).split('\n');
  const header = lines[0]?.trim().toLowerCase() || '';
  if (!header.startsWith('architecture')) return { error: 'Expected an architecture diagram.' };

  type Elem = { id: string; label: string; kind: 'service' | 'junction'; icon?: string; parentGroupId?: string | null };
  type Group = { id: string; name: string; icon?: string; parentGroupId?: string | null; memberIds: string[] };

  const elems: Elem[] = [];
  const elemById = new Map<string, Elem>();
  const groups: Group[] = [];
  const groupById = new Map<string, Group>();

  const iconToEmoji = (icon: string | undefined) => {
    const k = safeSingleLine(icon || '').toLowerCase();
    if (!k) return undefined;
    if (k === 'cloud') return '☁️';
    if (k === 'database') return '🗄️';
    if (k === 'disk') return '💽';
    if (k === 'internet') return '🌐';
    if (k === 'server') return '🖥️';
    return '⬛︎';
  };

  const ensureGroup = (id: string, name: string, icon?: string, parentGroupId?: string | null) => {
    const gid = safeSingleLine(id);
    if (!gid) return null;
    const existing = groupById.get(gid);
    if (existing) return existing;
    const g: Group = {
      id: gid,
      name: safeSingleLine(name) || gid,
      icon: iconToEmoji(icon),
      parentGroupId: parentGroupId || null,
      memberIds: [],
    };
    groups.push(g);
    groupById.set(gid, g);
    return g;
  };

  const addElem = (id: string, label: string, kind: Elem['kind'], icon?: string, parentGroupId?: string | null) => {
    const eid = safeSingleLine(id);
    if (!eid) return null;
    const existing = elemById.get(eid);
    if (existing) return existing;
    const e: Elem = { id: eid, label: safeSingleLine(label) || eid, kind, icon: iconToEmoji(icon), parentGroupId: parentGroupId || null };
    elems.push(e);
    elemById.set(eid, e);
    if (parentGroupId) ensureGroup(parentGroupId, parentGroupId)?.memberIds.push(eid);
    return e;
  };

  const rels: Array<{ from: string; to: string; directed: boolean }> = [];

  for (const raw of lines.slice(1)) {
    const line = stripMermaidComments(raw).trim();
    if (!line) continue;

    let m = line.match(/^group\s+([A-Za-z0-9_.$-]+)(?:\(\s*([^)]+?)\s*\))?\s*\[\s*([\s\S]*?)\s*\](?:\s+in\s+([A-Za-z0-9_.$-]+))?\s*$/i);
    if (m) {
      ensureGroup(m[1], m[3], m[2], m[4] || null);
      continue;
    }

    m = line.match(/^service\s+([A-Za-z0-9_.$-]+)(?:\(\s*([^)]+?)\s*\))?\s*\[\s*([\s\S]*?)\s*\](?:\s+in\s+([A-Za-z0-9_.$-]+))?\s*$/i);
    if (m) {
      addElem(m[1], m[3], 'service', m[2], m[4] || null);
      continue;
    }

    m = line.match(/^junction\s+([A-Za-z0-9_.$-]+)(?:\s+in\s+([A-Za-z0-9_.$-]+))?\s*$/i);
    if (m) {
      addElem(m[1], m[1], 'junction', 'square', m[2] || null);
      continue;
    }

    m = line.match(
      /^([A-Za-z0-9_.$-]+)(?:\{group\})?\s*:\s*[TBLR]\s*([<]?\s*--\s*[>]?|[<]?\s*-->\s*[>]?|[<]?\s*--\s*[>]?|[<]?\s*<--\s*[>]?|[<]?\s*<-->\s*[>]?|-->|<--|--|<-->)\s*[TBLR]\s*:\s*([A-Za-z0-9_.$-]+)(?:\{group\})?\s*$/i,
    );
    if (m) {
      const fromId = safeSingleLine(m[1]);
      const op = safeSingleLine(m[2]);
      const toId = safeSingleLine(m[3]);
      addElem(fromId, fromId, 'service');
      addElem(toId, toId, 'service');
      rels.push({ from: fromId, to: toId, directed: op.includes('>') && !op.includes('<') });
      continue;
    }
  }

  if (!elems.length) return { error: 'No architecture nodes detected.' };

  const ids = elems.map((e) => e.id);
  const boxKeyById = new Map<string, string>();
  ids.forEach((id, idx) => boxKeyById.set(id, `sfbox-${idx + 1}`));

  const layout = layoutBoxesInGrid(ids, { startX: 2, startY: 2, boxW: 2, boxH: 2 });
  const boxes: SystemFlowBox[] = layout.map((p) => {
    const e = elemById.get(p.key)!;
    const icon = e.icon || (e.kind === 'junction' ? '⬛︎' : '🧩');
    return { key: boxKeyById.get(e.id)!, name: e.label, icon, gridX: p.gridX, gridY: p.gridY, gridWidth: p.gridWidth, gridHeight: p.gridHeight };
  });

  const links: SystemFlowLink[] = rels
    .map((r, idx) => {
      const fromKey = boxKeyById.get(r.from);
      const toKey = boxKeyById.get(r.to);
      if (!fromKey || !toKey) return null;
      return { id: `sflink-${idx + 1}`, fromKey, toKey, order: idx + 1, dashStyle: 'solid', endShape: r.directed ? 'arrow' : 'none' } satisfies SystemFlowLink;
    })
    .filter(Boolean) as SystemFlowLink[];

  const zones = groups
    .map((g, idx) => ({
      id: `sfzone-${idx + 1}`,
      name: g.name,
      boxKeys: g.memberIds.map((eid) => boxKeyById.get(eid)).filter(Boolean) as string[],
      outlineStyle: 'dashed' as const,
    }))
    .filter((z) => z.boxKeys.length > 0);

  const sfid = 'systemflow-1';
  const sf = makeSystemFlowState({ sfid, title: 'System flow (architecture)', boxes, links, zones });
  const md = renderNodeLines([sf.rootLine]).markdown + makeSeparatorAndBlocks(sf.blocks);
  return { title: 'System flow (architecture)', kind: 'diagram', markdown: md };
}

