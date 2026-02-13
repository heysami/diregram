import * as Y from 'yjs';

export type PinnedTagsData = {
  /** Ordered list of pinned tag ids */
  tagIds: string[];
};

const BLOCK_TYPE = 'pinned-tags';

function findBlock(text: string): RegExpMatchArray | null {
  return text.match(new RegExp(`\\\`\\\`\\\`${BLOCK_TYPE}\\n([\\s\\S]*?)\\n\\\`\\\`\\\``));
}

function upsertBlock(text: string, json: unknown): string {
  const dataBlock = `\`\`\`${BLOCK_TYPE}\n${JSON.stringify(json, null, 2)}\n\`\`\``;
  const re = new RegExp(`\\\`\\\`\\\`${BLOCK_TYPE}\\n[\\s\\S]*?\\n\\\`\\\`\\\``);
  if (re.test(text)) return text.replace(re, dataBlock);

  const separatorIndex = text.indexOf('\n---\n');
  if (separatorIndex !== -1) {
    return text.slice(0, separatorIndex + 5) + '\n' + dataBlock + text.slice(separatorIndex + 5);
  }
  return text + (text.endsWith('\n') ? '' : '\n') + '\n---\n' + dataBlock;
}

function normalizeTagIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  raw.forEach((x) => {
    const s = typeof x === 'string' ? x.trim() : '';
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

export function loadPinnedTags(doc: Y.Doc | null | undefined): PinnedTagsData {
  if (!doc) return { tagIds: [] };
  const yText = doc.getText('nexus');
  const text = yText.toString();
  const match = findBlock(text);
  if (!match) return { tagIds: [] };
  try {
    const parsed = JSON.parse(match[1]);
    const rec = (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >;
    return { tagIds: normalizeTagIds(rec.tagIds) };
  } catch {
    return { tagIds: [] };
  }
}

export function savePinnedTags(doc: Y.Doc | null | undefined, data: PinnedTagsData): void {
  if (!doc) return;
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const next = upsertBlock(current, { tagIds: normalizeTagIds(data.tagIds) });
  if (next === current) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, next);
  });
}

