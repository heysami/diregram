import * as Y from 'yjs';

export interface NexusDataObject {
  id: string;
  name: string;
  // Optional annotation rendered under the data object card (and persisted in markdown).
  annotation?: string;
  // Arbitrary JSON-ish structure. Keep it flexible for now.
  data: unknown;
}

export interface NexusDataObjectStore {
  nextId: number;
  objects: NexusDataObject[];
}

const DEFAULT_STORE: NexusDataObjectStore = { nextId: 1, objects: [] };

const BLOCK_RE = /```data-objects\n([\s\S]*?)\n```/;
const FULL_BLOCK_RE = /```data-objects\n[\s\S]*?\n```/;

export function loadDataObjects(doc: Y.Doc): NexusDataObjectStore {
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const match = current.match(BLOCK_RE);
  if (!match) return { ...DEFAULT_STORE };

  try {
    const parsed = JSON.parse(match[1]);
    const nextId = typeof parsed?.nextId === 'number' ? parsed.nextId : 1;
    const objectsRaw = Array.isArray(parsed?.objects) ? parsed.objects : [];
    const objects: NexusDataObject[] = (objectsRaw as unknown[])
      .map((o: unknown): NexusDataObject | null => {
        if (!o || typeof o !== 'object') return null;
        const rec = o as Record<string, unknown>;
        if (typeof rec.id !== 'string' || typeof rec.name !== 'string') return null;
        const annotation = typeof rec.annotation === 'string' ? rec.annotation : undefined;
        return { id: rec.id, name: rec.name, annotation, data: rec.data };
      })
      .filter((x): x is NexusDataObject => x !== null);

    return { nextId, objects };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

export function saveDataObjects(doc: Y.Doc, store: NexusDataObjectStore): void {
  const yText = doc.getText('nexus');
  const current = yText.toString();

  const block = `\`\`\`data-objects\n${JSON.stringify(store, null, 2)}\n\`\`\``;

  let next = current;
  if (next.match(FULL_BLOCK_RE)) {
    next = next.replace(FULL_BLOCK_RE, block);
  } else {
    const separatorIndex = next.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      next = next.slice(0, separatorIndex) + '\n' + block + '\n' + next.slice(separatorIndex);
    } else {
      next = next + (next.endsWith('\n') ? '' : '\n') + '\n' + block;
    }
  }

  if (next !== current) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, next);
    });
  }
}

export function createDataObject(doc: Y.Doc, name: string): NexusDataObject {
  const store = loadDataObjects(doc);
  const id = `do-${store.nextId}`;
  const obj: NexusDataObject = { id, name: name.trim() || id, data: {} };
  const next: NexusDataObjectStore = {
    nextId: store.nextId + 1,
    objects: [...store.objects, obj],
  };
  saveDataObjects(doc, next);
  return obj;
}

export function ensureDataObject(doc: Y.Doc, id: string, name?: string): NexusDataObject {
  const store = loadDataObjects(doc);
  const existing = store.objects.find((o) => o.id === id);
  if (existing) return existing;

  const trimmedId = id.trim();
  const obj: NexusDataObject = { id: trimmedId, name: (name || trimmedId).trim() || trimmedId, data: {} };

  // If the id matches the do-N pattern, ensure nextId doesn't later collide.
  const m = /^do-(\d+)$/.exec(trimmedId);
  const n = m ? Number.parseInt(m[1], 10) : NaN;
  const nextId = Number.isFinite(n) ? Math.max(store.nextId, n + 1) : store.nextId;

  const next: NexusDataObjectStore = {
    nextId,
    objects: [...store.objects, obj],
  };
  saveDataObjects(doc, next);
  return obj;
}

export function upsertDataObject(doc: Y.Doc, obj: NexusDataObject): void {
  const store = loadDataObjects(doc);
  const idx = store.objects.findIndex((o) => o.id === obj.id);
  const objects =
    idx >= 0
      ? store.objects.map((o, i) => (i === idx ? obj : o))
      : [...store.objects, obj];
  const next: NexusDataObjectStore = {
    nextId: store.nextId,
    objects,
  };
  saveDataObjects(doc, next);
}

