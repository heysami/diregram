import { normalizeNewlines, safeSingleLine, stripMermaidComments } from './text';

export function stateDiagramToFlowchart(stateSrc: string) {
  const lines = normalizeNewlines(stateSrc).split('\n');
  const rest = lines.slice(1);
  const idByLabel = new Map<string, string>();
  let next = 1;

  const ensureId = (labelRaw: string) => {
    const label = safeSingleLine(labelRaw).replace(/^"|"$/g, '').trim();
    if (!label) return null;
    const existing = idByLabel.get(label);
    if (existing) return { id: existing, label };
    const id = `st-${next++}`;
    idByLabel.set(label, id);
    return { id, label };
  };

  const mapToken = (tokRaw: string, side: 'from' | 'to') => {
    const tok = safeSingleLine(tokRaw).replace(/\s+/g, ' ').trim();
    const isStar = tok === '[*]' || tok === '[ * ]' || tok === '[ *]' || tok === '[* ]';
    if (isStar) return side === 'from' ? { id: 'start', label: 'Start' } : { id: 'end', label: 'End' };
    return ensureId(tok) || { id: tok.replace(/[^\w.$-]+/g, '_') || `st-${next++}`, label: tok };
  };

  const edges: string[] = [];
  for (const raw of rest) {
    const line = stripMermaidComments(raw).trim();
    if (!line) continue;
    if (line.startsWith('state ') || line === '{' || line === '}' || line.startsWith('note ') || line.startsWith('%%')) continue;
    const m = line.match(/^(.+?)\s*-->\s*(.+?)(?:\s*:\s*([\s\S]+))?$/);
    if (!m) continue;
    const from = mapToken(m[1], 'from');
    const to = mapToken(m[2], 'to');
    const lbl = safeSingleLine(m[3] || '');
    const fromTok = `${from.id}["${from.label.replace(/"/g, '\\"')}"]`;
    const toTok = `${to.id}["${to.label.replace(/"/g, '\\"')}"]`;
    if (lbl) edges.push(`  ${fromTok} -->|${lbl.replace(/\|/g, '\\|')}| ${toTok}`);
    else edges.push(`  ${fromTok} --> ${toTok}`);
  }
  return `flowchart TD\n${edges.join('\n')}\n`;
}

