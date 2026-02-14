function normalizeNewlines(s: string): string {
  return (s ?? '').replace(/\r\n?/g, '\n');
}

const TABLEJSON_FULL_BLOCK_RE = /```tablejson\n[\s\S]*?\n```/;

/**
 * Replace the first ```tablejson fenced block, or append one at the end.
 *
 * `serializedLines` should include fences (as produced by `serializeTableToMarkdown`).
 */
export function upsertTableJson(markdown: string, serializedLines: string[]): string {
  const t = normalizeNewlines(markdown);
  const block = serializedLines.join('\n');

  if (TABLEJSON_FULL_BLOCK_RE.test(t)) {
    return t.replace(TABLEJSON_FULL_BLOCK_RE, block);
  }

  const needsLeadingNewline = t.length > 0 && !t.endsWith('\n');
  const sep = t.trim().length === 0 ? '' : '\n\n';
  return t + (needsLeadingNewline ? '\n' : '') + sep + block + '\n';
}

