import type { SystemFlowBox, SystemFlowLink } from '../types';
import { makeSeparatorAndBlocks, renderNodeLines } from '../markdown';
import { clamp, normalizeNewlines, safeSingleLine, stripMermaidComments } from '../text';
import { makeSystemFlowState } from '../systemflow';

export function convertPacketDiagram(src: string): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const lines = normalizeNewlines(src).split('\n');
  const header = lines[0]?.trim().toLowerCase() || '';
  if (!header.startsWith('packet')) return { error: 'Expected a packet diagram.' };

  type Field = { bits: number; label: string };
  const fields: Field[] = [];

  for (const raw of lines.slice(1)) {
    const line = stripMermaidComments(raw).trim();
    if (!line) continue;
    const m = line.match(/^(\+?\d+)(?:\s*-\s*(\d+))?\s*:\s*([\s\S]+)$/);
    if (!m) continue;
    const aRaw = m[1];
    const bRaw = m[2];
    const label = safeSingleLine(m[3]).replace(/^"(.+)"$/, '$1').trim();
    if (!label) continue;

    if (aRaw.startsWith('+')) {
      const bits = Number(aRaw.slice(1));
      if (!Number.isFinite(bits) || bits <= 0) continue;
      fields.push({ bits, label });
      continue;
    }

    const start = Number(aRaw);
    const end = bRaw ? Number(bRaw) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const bits = end - start + 1;
    fields.push({ bits, label });
  }

  if (!fields.length) return { error: 'No packet fields detected.' };

  const sfid = 'systemflow-1';
  const boxes: SystemFlowBox[] = [];
  const links: SystemFlowLink[] = [];

  let x = 2;
  let y = 2;
  let prevKey: string | null = null;

  fields.forEach((f, idx) => {
    const key = `sfbox-${idx + 1}`;
    const w = clamp(Math.round(f.bits / 8) || 1, 1, 6);
    const h = 2;
    if (x + w + 1 > 24) {
      x = 2;
      y += 3;
    }
    boxes.push({ key, name: f.label, icon: '📦', gridX: x, gridY: y, gridWidth: w, gridHeight: h });
    if (prevKey) {
      links.push({
        id: `sflink-${links.length + 1}`,
        fromKey: prevKey,
        toKey: key,
        order: links.length + 1,
        dashStyle: 'solid',
        endShape: 'arrow',
      });
    }
    prevKey = key;
    x += w + 1;
  });

  const sf = makeSystemFlowState({ sfid, title: 'System flow (packet)', boxes, links });
  const md = renderNodeLines([sf.rootLine]).markdown + makeSeparatorAndBlocks(sf.blocks);
  return { title: 'System flow (packet)', kind: 'diagram', markdown: md };
}

