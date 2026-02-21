import type { SystemFlowBox, SystemFlowLink } from '../types';
import { makeSeparatorAndBlocks, renderNodeLines } from '../markdown';
import { normalizeNewlines, safeSingleLine, stripMermaidComments } from '../text';
import { makeSystemFlowState } from '../systemflow';

export function convertSequenceDiagram(src: string): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const lines = normalizeNewlines(src).split('\n');
  const titleLine = lines.find((l) => l.trim().toLowerCase().startsWith('title '));
  const title = titleLine ? safeSingleLine(titleLine.trim().slice(6)) : 'Tech flow (sequence)';

  type Part = { name: string; kind: string; boxKey: string; icon?: string };
  const parts: Part[] = [];
  const partByName = new Map<string, Part>();

  const addPart = (nameRaw: string, kind: string) => {
    const name = safeSingleLine(nameRaw).replace(/^"|"$/g, '').trim();
    if (!name) return null;
    const existing = partByName.get(name);
    if (existing) return existing;
    const boxKey = `sfbox-${parts.length + 1}`;
    const icon = (() => {
      const k = kind.toLowerCase();
      if (k === 'actor') return '🧑';
      if (k === 'participant') return '👤';
      if (k === 'database') return '🗄️';
      if (k === 'boundary') return '🧱';
      if (k === 'control') return '🎛️';
      if (k === 'entity') return '📦';
      return '⬛︎';
    })();
    const p: Part = { name, kind, boxKey, icon };
    parts.push(p);
    partByName.set(name, p);
    return p;
  };

  const messages: Array<{ from: string; to: string; text: string; dashed: boolean }> = [];

  for (const raw of lines.slice(1)) {
    const line = stripMermaidComments(raw).trim();
    if (!line) continue;
    const decl = line.match(/^(participant|actor|xactor|database|boundary|control|entity)\s+(.+)$/i);
    if (decl) {
      const kind = decl[1].toLowerCase() === 'xactor' ? 'actor' : decl[1];
      const rest = decl[2].trim();
      const asMatch = rest.match(/^"?(.*?)"?\s+as\s+([A-Za-z0-9_.$-]+)$/i);
      if (asMatch) {
        addPart(asMatch[1], kind);
        addPart(asMatch[2], kind);
      } else {
        addPart(rest, kind);
      }
      continue;
    }

    const msg = line.match(/^(.+?)(--?>?>?|->>?)\s*(.+?)(?::\s*([\s\S]*))?$/);
    if (msg && msg[2] && msg[3]) {
      const fromName = safeSingleLine(msg[1]);
      const arrow = msg[2];
      const toName = safeSingleLine(msg[3]);
      const text = safeSingleLine(msg[4] || '');
      const dashed = arrow.includes('--');
      addPart(fromName, 'participant');
      addPart(toName, 'participant');
      messages.push({ from: fromName, to: toName, text, dashed });
    }
  }

  if (!parts.length) return { error: 'No participants were detected in the sequence diagram.' };

  const boxes: SystemFlowBox[] = parts.map((p, idx) => ({
    key: p.boxKey,
    name: p.name,
    icon: p.icon,
    gridX: 2 + idx * 3,
    gridY: 2,
    gridWidth: 1,
    gridHeight: 5,
  }));

  const links: SystemFlowLink[] = messages
    .map((m, idx) => {
      const from = partByName.get(m.from)?.boxKey;
      const to = partByName.get(m.to)?.boxKey;
      if (!from || !to) return null;
      return {
        id: `sflink-${idx + 1}`,
        fromKey: from,
        toKey: to,
        order: idx + 1,
        text: m.text,
        dashStyle: m.dashed ? 'dashed' : 'solid',
        endShape: 'arrow',
      } satisfies SystemFlowLink;
    })
    .filter(Boolean) as SystemFlowLink[];

  const sfid = 'systemflow-1';
  const sf = makeSystemFlowState({ sfid, title, boxes, links });
  const md = renderNodeLines([sf.rootLine]).markdown + makeSeparatorAndBlocks(sf.blocks);
  return { title, kind: 'diagram', markdown: md };
}

