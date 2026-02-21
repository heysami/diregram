import type { NodeLine } from './types';

export function renderNodeLines(lines: NodeLine[]): { markdown: string; lineIndexByKey: Map<string, number> } {
  const out: string[] = [];
  const lineIndexByKey = new Map<string, number>();
  lines.forEach((l) => {
    const text = `${'  '.repeat(Math.max(0, l.indent))}${l.content}`.trimEnd();
    lineIndexByKey.set(`${out.length}`, out.length);
    out.push(text);
  });
  return { markdown: out.join('\n').trimEnd() + '\n', lineIndexByKey };
}

export function nodeIdForLineIndex(lineIndex: number) {
  return `node-${lineIndex}`;
}

export function makeSeparatorAndBlocks(blocks: Array<{ type: string; body: unknown }>): string {
  if (!blocks.length) return '';
  const rendered = blocks
    .map((b) => {
      const json = typeof b.body === 'string' ? b.body : JSON.stringify(b.body, null, 2);
      return `\`\`\`${b.type}\n${json}\n\`\`\``;
    })
    .join('\n\n');
  return `\n---\n\n${rendered.trimEnd()}\n`;
}

