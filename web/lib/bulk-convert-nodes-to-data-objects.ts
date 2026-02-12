import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';

type DataObject = { id: string; name: string; data: unknown };
type DataObjectStore = { nextId: number; objects: DataObject[] };

const BLOCK_RE = /```data-objects\n([\s\S]*?)\n```/;
const FULL_BLOCK_RE = /```data-objects\n[\s\S]*?\n```/;

function parseStoreFromMarkdown(markdown: string): DataObjectStore {
  const match = markdown.match(BLOCK_RE);
  if (!match) return { nextId: 1, objects: [] };
  try {
    const parsed = JSON.parse(match[1]);
    const nextId = typeof parsed?.nextId === 'number' ? parsed.nextId : 1;
    const objectsRaw = Array.isArray(parsed?.objects) ? parsed.objects : [];
    const objects: DataObject[] = (objectsRaw as unknown[])
      .map((o: unknown) => {
        if (!o || typeof o !== 'object') return null;
        const rec = o as Record<string, unknown>;
        if (typeof rec.id !== 'string' || typeof rec.name !== 'string') return null;
        return { id: rec.id, name: rec.name, data: rec.data } satisfies DataObject;
      })
      .filter((x): x is DataObject => x !== null);
    return { nextId, objects };
  } catch {
    return { nextId: 1, objects: [] };
  }
}

function writeStoreIntoMarkdown(markdown: string, store: DataObjectStore): string {
  const block = `\`\`\`data-objects\n${JSON.stringify(store, null, 2)}\n\`\`\``;
  if (markdown.match(FULL_BLOCK_RE)) {
    return markdown.replace(FULL_BLOCK_RE, block);
  }
  const separatorIndex = markdown.indexOf('\n---\n');
  if (separatorIndex !== -1) {
    return markdown.slice(0, separatorIndex) + '\n' + block + '\n' + markdown.slice(separatorIndex);
  }
  return markdown + (markdown.endsWith('\n') ? '' : '\n') + '\n' + block;
}

export function bulkConvertNodesToDataObjects(doc: Y.Doc, nodes: NexusNode[]): void {
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const lines = current.split('\n');

  const store = parseStoreFromMarkdown(current);
  const byNameLower = new Map<string, { id: string }>();
  store.objects.forEach((o) => byNameLower.set(o.name.trim().toLowerCase(), { id: o.id }));

  const DO_COMMENT_RE = /\s*<!--\s*do:[\s\S]*?\s*-->\s*/g;

  let nextId = store.nextId;
  let objects = [...store.objects];
  let changed = false;

  const setLineDataObjectId = (lineIndex: number, id: string) => {
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    const original = lines[lineIndex];
    const without = original.replace(DO_COMMENT_RE, ' ').replace(/\s+$/g, '');
    const withId = `${without} <!-- do:${id} -->`;
    if (withId !== original) {
      lines[lineIndex] = withId;
      changed = true;
    }
  };

  nodes.forEach((n) => {
    const name = (n.content || '').trim();
    if (!name) return;
    if (n.dataObjectId) return;

    const hit = byNameLower.get(name.toLowerCase());
    const id =
      hit?.id ||
      (() => {
        const newId = `do-${nextId}`;
        nextId += 1;
        const obj: DataObject = { id: newId, name, data: {} };
        objects = [...objects, obj];
        byNameLower.set(name.toLowerCase(), { id: newId });
        changed = true;
        return newId;
      })();

    if (n.isHub && n.variants && n.variants.length > 0) {
      n.variants.forEach((v) => setLineDataObjectId(v.lineIndex, id));
    } else {
      setLineDataObjectId(n.lineIndex, id);
    }
  });

  if (!changed) return;

  let nextMarkdown = lines.join('\n');
  nextMarkdown = writeStoreIntoMarkdown(nextMarkdown, { nextId, objects });

  if (nextMarkdown === current) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, nextMarkdown);
  });
}

