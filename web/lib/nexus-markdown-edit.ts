import * as Y from 'yjs';

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findLineIndexByToken(lines: string[], token: string, fallbackIndex: number) {
  const idx = lines.findIndex((l) => l.includes(token));
  if (idx !== -1) return idx;
  return fallbackIndex;
}

export function computeIndentedBlockEndExclusive(lines: string[], startIdx: number) {
  if (startIdx < 0 || startIdx >= lines.length) return startIdx;
  const rootIndent = (lines[startIdx].match(/^(\s*)/)?.[1] || '').length;
  let endIdx = startIdx + 1;
  for (; endIdx < lines.length; endIdx += 1) {
    const line = lines[endIdx];
    if (!line.trim()) continue;
    const indent = (line.match(/^(\s*)/)?.[1] || '').length;
    if (indent <= rootIndent) break;
  }
  return endIdx;
}

export function replaceLineTitleKeepingSuffix(line: string, nextTitleRaw: string) {
  const nextTitle = nextTitleRaw.trim();
  if (!nextTitle) return line;
  const indent = line.match(/^(\s*)/)?.[1] || '';
  const afterIndent = line.slice(indent.length);
  const a = afterIndent.indexOf(' #');
  const b = afterIndent.indexOf(' <!--');
  const cut = Math.min(...[a, b].filter((n) => n >= 0).concat([afterIndent.length]));
  const suffix = afterIndent.slice(cut);
  return `${indent}${nextTitle}${suffix}`;
}

export function renameLineByTokenOrIndex(opts: {
  doc: Y.Doc;
  token: string;
  fallbackIndex: number;
  nextTitleRaw: string;
}) {
  const { doc, token, fallbackIndex, nextTitleRaw } = opts;
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');
  const idx = findLineIndexByToken(lines, token, fallbackIndex);
  if (idx < 0 || idx >= lines.length) return false;
  const nextLine = replaceLineTitleKeepingSuffix(lines[idx], nextTitleRaw);
  if (nextLine === lines[idx]) return false;
  doc.transact(() => {
    lines[idx] = nextLine;
    yText.delete(0, yText.length);
    yText.insert(0, lines.join('\n'));
  });
  return true;
}

export function removeFencedBlock(markdown: string, fenceId: string) {
  const esc = escapeRegExp(fenceId);
  return markdown.replace(new RegExp(`\\\`\\\`\\\`${esc}\\n[\\s\\S]*?\\n\\\`\\\`\\\`\\n?`, 'g'), '');
}

