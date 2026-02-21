import * as Y from 'yjs';
import { loadExpandedGridNodesFromDoc, saveExpandedGridNodesToDoc, type ExpandedGridNodeRuntime } from '@/lib/expanded-grid-storage';
import { loadExpandedNodeMetadata, saveExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import { loadSystemFlowStateFromMarkdown, saveSystemFlowStateToMarkdown } from '@/lib/system-flow-storage';

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

export function deleteDataObject(doc: Y.Doc, id: string): void {
  const targetId = String(id || '').trim();
  if (!targetId) return;
  const store = loadDataObjects(doc);
  const nextObjects = store.objects.filter((o) => o.id !== targetId);
  if (nextObjects.length === store.objects.length) return;
  saveDataObjects(doc, { ...store, objects: nextObjects });
}

function getAllExpandedRunningNumbersFromMarkdown(markdown: string): number[] {
  const set = new Set<number>();
  const scan = (re: RegExp) => {
    for (;;) {
      const m = re.exec(markdown);
      if (!m) break;
      const rn = Number.parseInt(m[1], 10);
      if (Number.isFinite(rn)) set.add(rn);
    }
  };
  scan(/```expanded-grid-(\d+)\n/g);
  scan(/```expanded-metadata-(\d+)\n/g);
  return Array.from(set.values()).sort((a, b) => a - b);
}

function stripDataObjectLinksFromNodeLines(markdown: string, targetId: string): string {
  const lines = markdown.split('\n');
  let didChange = false;
  const nextLines = lines.map((line) => {
    let didRemoveDo = false;
    const next = (line || '').replace(/<!--\s*do:([^>]+?)\s*-->/g, (m, inner) => {
      if (String(inner || '').trim() !== targetId) return m;
      didRemoveDo = true;
      didChange = true;
      return '';
    });
    if (!didRemoveDo) return next;
    // If the object link is removed, also remove dependent selectors on the same node line.
    return next
      .replace(/\s*<!--\s*doattrs:[\s\S]*?\s*-->\s*/g, ' ')
      .replace(/\s*<!--\s*dostatus:[\s\S]*?\s*-->\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+$/g, '');
  });
  if (!didChange) return markdown;
  return nextLines.join('\n');
}

function scrubGridNodeDataObjectRefs(node: ExpandedGridNodeRuntime, targetId: string): ExpandedGridNodeRuntime {
  const scrubItemLike = (it: any): { next: any; changed: boolean } => {
    if (!it || typeof it !== 'object') return { next: it, changed: false };
    if (typeof it.dataObjectId === 'string' && it.dataObjectId.trim() === targetId) {
      const { dataObjectId: _id, dataObjectAttributeIds: _a, dataObjectAttributeMode: _m, ...rest } = it as any;
      return { next: rest, changed: true };
    }
    return { next: it, changed: false };
  };
  const scrubItems = (arr: any[] | undefined): { next: any[] | undefined; changed: boolean } => {
    if (!Array.isArray(arr)) return { next: arr, changed: false };
    let changed = false;
    const next = arr.map((it) => {
      const res = scrubItemLike(it);
      if (res.changed) changed = true;
      return res.next;
    });
    return { next, changed };
  };
  const scrubTabs = (tabs: any[] | undefined): { next: any[] | undefined; changed: boolean } => {
    if (!Array.isArray(tabs)) return { next: tabs, changed: false };
    let changed = false;
    const next = tabs.map((t) => {
      const res = scrubItemLike(t);
      let cur = res.next;
      if (res.changed) changed = true;
      if (cur && typeof cur === 'object' && 'items' in (cur as any)) {
        const itemsRes = scrubItems((cur as any).items);
        if (itemsRes.changed) {
          changed = true;
          cur = { ...(cur as any), items: itemsRes.next };
        }
      }
      return cur;
    });
    return { next, changed };
  };
  const scrubSections = (secs: any[] | undefined): { next: any[] | undefined; changed: boolean } => {
    if (!Array.isArray(secs)) return { next: secs, changed: false };
    let changed = false;
    const next = secs.map((s) => {
      const res = scrubItemLike(s);
      let cur = res.next;
      if (res.changed) changed = true;
      if (cur && typeof cur === 'object' && 'items' in (cur as any)) {
        const itemsRes = scrubItems((cur as any).items);
        if (itemsRes.changed) {
          changed = true;
          cur = { ...(cur as any), items: itemsRes.next };
        }
      }
      return cur;
    });
    return { next, changed };
  };

  let next: any = node;
  let changed = false;

  if (typeof node.dataObjectId === 'string' && node.dataObjectId.trim() === targetId) {
    const { dataObjectId: _id, dataObjectAttributeIds: _attrs, dataObjectAttributeMode: _mode, ...rest } = node as any;
    next = rest;
    changed = true;
  }

  if (typeof (next as any).sourceChildDataObjectId === 'string' && (next as any).sourceChildDataObjectId.trim() === targetId) {
    const { sourceChildDataObjectId: _x, ...rest } = next as any;
    next = rest;
    changed = true;
  }

  const tabsRes = scrubTabs((next as any).uiTabs);
  if (tabsRes.changed) {
    if (next === node) next = { ...(next as any) };
    (next as any).uiTabs = tabsRes.next;
    changed = true;
  }
  const sectionsRes = scrubSections((next as any).uiSections);
  if (sectionsRes.changed) {
    if (next === node) next = { ...(next as any) };
    (next as any).uiSections = sectionsRes.next;
    changed = true;
  }

  return (changed ? next : node) as ExpandedGridNodeRuntime;
}

function getAllSystemFlowIdsFromMarkdown(markdown: string): string[] {
  const set = new Set<string>();
  const re = /```systemflow-([^\n]+)\n/g;
  for (;;) {
    const m = re.exec(markdown);
    if (!m) break;
    const sfid = String(m[1] || '').trim();
    if (sfid) set.add(sfid);
  }
  return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
}

function stripDataObjectLinksFromSystemFlows(markdown: string, targetId: string): string {
  const sfids = getAllSystemFlowIdsFromMarkdown(markdown);
  if (!sfids.length) return markdown;
  let next = markdown;
  sfids.forEach((sfid) => {
    const state = loadSystemFlowStateFromMarkdown(next, sfid);
    let changed = false;
    const boxes = state.boxes.map((b) => {
      if (String(b.dataObjectId || '').trim() !== targetId) return b;
      changed = true;
      return { ...b, dataObjectId: undefined, dataObjectAttributeIds: undefined };
    });
    if (!changed) return;
    next = saveSystemFlowStateToMarkdown(next, sfid, { ...state, boxes });
  });
  return next;
}

/**
 * Delete a data object and clean up references across:
 * - node lines (<!-- do:... --> + dependent doattrs/dostatus)
 * - tech flow blocks (systemflow-*)
 * - expanded node metadata blocks (expanded-metadata-*)
 * - expanded grid blocks (expanded-grid-*)
 */
export function deleteDataObjectAndCleanupReferences(doc: Y.Doc, id: string): void {
  const targetId = String(id || '').trim();
  if (!targetId) return;

  // 1) Remove object from store
  deleteDataObject(doc, targetId);

  // 2) Remove node-line + system-flow links in markdown
  {
    const yText = doc.getText('nexus');
    const current = yText.toString();
    let next = stripDataObjectLinksFromNodeLines(current, targetId);
    next = stripDataObjectLinksFromSystemFlows(next, targetId);
    if (next !== current) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, next);
      });
    }
  }

  // 3) Scrub expanded grids + metadata
  const markdownNow = doc.getText('nexus').toString();
  const runningNumbers = getAllExpandedRunningNumbersFromMarkdown(markdownNow);
  runningNumbers.forEach((rn) => {
    // expanded metadata
    const meta = loadExpandedNodeMetadata(doc, rn);
    if (meta?.dataObjectId && String(meta.dataObjectId).trim() === targetId) {
      const { dataObjectId: _id, dataObjectAttributeIds: _a, ...rest } = meta as any;
      saveExpandedNodeMetadata(doc, rn, rest);
    }

    // expanded grid nodes
    const loaded = loadExpandedGridNodesFromDoc(doc, rn);
    const nodes = loaded.nodes || [];
    let changed = false;
    const nextNodes = nodes.map((n) => {
      const nn = scrubGridNodeDataObjectRefs(n, targetId);
      if (nn !== n) changed = true;
      return nn;
    });
    if (changed) saveExpandedGridNodesToDoc(doc, rn, nextNodes);
  });
}

