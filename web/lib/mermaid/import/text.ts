import { clamp } from './math';

export function normalizeNewlines(s: string) {
  return String(s || '').replace(/\r\n?/g, '\n');
}

export function safeSingleLine(s: string) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

export function stripMermaidComments(line: string) {
  const raw = String(line || '');
  const idx = raw.indexOf('%%');
  return idx === -1 ? raw : raw.slice(0, idx);
}

export function stripCodeFencesAndFrontmatter(src: string) {
  const lines = normalizeNewlines(src).split('\n');
  const out: string[] = [];
  let inYaml = false;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const t = raw.trim();
    if (t === '---' && out.length === 0 && !inYaml) {
      inYaml = true;
      continue;
    }
    if (t === '---' && inYaml) {
      inYaml = false;
      continue;
    }
    if (inYaml) continue;

    if (t.startsWith('```')) continue;
    out.push(raw);
  }
  return out.join('\n');
}

export function firstMeaningfulLine(src: string): string {
  const lines = stripCodeFencesAndFrontmatter(src).split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('%%')) continue;
    if (line.startsWith('%%{')) continue;
    return line;
  }
  return '';
}

export function sliceToMermaidHeader(src: string) {
  const lines = normalizeNewlines(src).split('\n');
  const isHeader = (line: string) => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('%%') || t.startsWith('%%{')) return false;
    const low = t.toLowerCase();
    if (low.startsWith('flowchart') || low.startsWith('graph')) return true;
    if (low.startsWith('sequencediagram')) return true;
    if (low.startsWith('classdiagram')) return true;
    if (low.startsWith('statediagram')) return true;
    if (low.startsWith('erdiagram')) return true;
    if (low.startsWith('journey')) return true;
    if (low.startsWith('mindmap')) return true;
    if (t.startsWith('C4') || t.startsWith('c4')) return true;
    if (low.startsWith('block-beta') || low === 'block') return true;
    if (low.startsWith('packet-beta') || low === 'packet') return true;
    if (low.startsWith('architecture-beta') || low === 'architecture') return true;
    return false;
  };
  const idx = lines.findIndex(isHeader);
  return idx >= 0 ? lines.slice(idx).join('\n') : src;
}

export { clamp };

