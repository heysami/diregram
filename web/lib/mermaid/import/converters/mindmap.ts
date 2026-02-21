import type { NodeLine } from '../types';
import { renderNodeLines } from '../markdown';
import { normalizeNewlines, safeSingleLine, stripMermaidComments } from '../text';
import { parseFlowchartToken } from '../flowchart';

export function convertMindmap(src: string): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const rawLines = normalizeNewlines(src).split('\n');
  const title = 'Mindmap';
  const parsed: NodeLine[] = [];

  for (const raw of rawLines.slice(1)) {
    const cleaned = stripMermaidComments(raw);
    if (!cleaned.trim()) continue;
    const leading = cleaned.match(/^ */)?.[0]?.length ?? 0;
    const indentRaw = Math.floor(leading / 2);
    let content = cleaned.trim();

    content = content.replace(/::icon\([^)]+\)/g, '').trim();
    content = content.replace(/^[-*+]\s+/, '').trim();
    content = content.replace(/^"(.+)"$/, '$1').trim();

    if (/[A-Za-z0-9_.$-]+[\[{(]/.test(content)) {
      const tok = parseFlowchartToken(content);
      content = tok.label || tok.id || content;
    }

    content = safeSingleLine(content);
    if (!content) continue;
    parsed.push({ indent: indentRaw, content });
  }

  if (!parsed.length) return { error: 'Mindmap content was empty.' };

  const minIndent = Math.min(...parsed.map((l) => l.indent));
  const lines = parsed.map((l) => ({ ...l, indent: Math.max(0, l.indent - minIndent) }));
  const md = renderNodeLines(lines).markdown;
  return { title, kind: 'diagram', markdown: md };
}

