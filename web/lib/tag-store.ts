import * as Y from 'yjs';

export interface NexusTagGroup {
  id: string;
  name: string;
  /**
   * Optional stable ordering hint. Lower comes first.
   * If absent, callers should preserve the stored array order.
   */
  order?: number;
}

export interface NexusTag {
  id: string;
  groupId: string;
  name: string;
}

export interface NexusTagStore {
  nextGroupId: number;
  nextTagId: number;
  groups: NexusTagGroup[];
  tags: NexusTag[];
}

const DEFAULT_GROUPS: NexusTagGroup[] = [
  { id: 'tg-ungrouped', name: 'ungrouped', order: 0 },
  { id: 'tg-users', name: 'users', order: 1 },
  { id: 'tg-systems', name: 'systems', order: 2 },
  { id: 'tg-uiType', name: 'ui type', order: 3 },
  { id: 'tg-actors', name: 'actors', order: 4 },
  { id: 'tg-uiSurface', name: 'ui surface', order: 5 },
];

const DEFAULT_STORE: NexusTagStore = {
  nextGroupId: 1,
  nextTagId: 1,
  groups: DEFAULT_GROUPS,
  tags: [],
};

const DEFAULT_TAGS: NexusTag[] = [
  { id: 'tag-ui-view-item', groupId: 'tg-uiType', name: 'view item' },
  { id: 'tag-ui-list', groupId: 'tg-uiType', name: 'list' },
  { id: 'tag-ui-form', groupId: 'tg-uiType', name: 'form' },
  { id: 'tag-ui-popup', groupId: 'tg-uiType', name: 'pop up' },
  // Actor tags (machine-checkable actors; do NOT encode actors in node titles).
  { id: 'actor-applicant', groupId: 'tg-actors', name: 'applicant' },
  { id: 'actor-staff', groupId: 'tg-actors', name: 'staff' },
  { id: 'actor-system', groupId: 'tg-actors', name: 'system' },
  { id: 'actor-partner', groupId: 'tg-actors', name: 'partner' },
  // UI surface tags (required on expid screens to clarify which surface a screen belongs to).
  { id: 'ui-surface-public', groupId: 'tg-uiSurface', name: 'public' },
  { id: 'ui-surface-portal', groupId: 'tg-uiSurface', name: 'portal' },
  { id: 'ui-surface-admin', groupId: 'tg-uiSurface', name: 'admin' },
  { id: 'ui-surface-partner', groupId: 'tg-uiSurface', name: 'partner' },
];

const BLOCK_RE = /```tag-store\n([\s\S]*?)\n```/;
const FULL_BLOCK_RE = /```tag-store\n[\s\S]*?\n```/;

function normalizeName(raw: string): string {
  return raw.replace(/\r?\n/g, ' ').trim();
}

function ensureDefaultGroups(store: NexusTagStore): NexusTagStore {
  const groupById = new Map(store.groups.map((g) => [g.id, g]));
  const groups: NexusTagGroup[] = [...store.groups];
  DEFAULT_GROUPS.forEach((g) => {
    if (!groupById.has(g.id)) groups.push(g);
  });
  return { ...store, groups };
}

function ensureDefaultTags(store: NexusTagStore): NexusTagStore {
  const tagById = new Map(store.tags.map((t) => [t.id, t]));
  const tags: NexusTag[] = [...store.tags];
  DEFAULT_TAGS.forEach((t) => {
    if (!tagById.has(t.id)) tags.push(t);
  });
  return { ...store, tags };
}

function sortGroupsByOrderForLoad(store: NexusTagStore): NexusTagStore {
  // Legacy support: if order exists, use it to sort on load.
  // After that, the array order becomes authoritative (and is persisted).
  const hasOrder = store.groups.some((g) => typeof g.order === 'number');
  if (!hasOrder) return store;
  const groups = [...store.groups].sort(
    (a, b) => (Number(a.order ?? 9999) - Number(b.order ?? 9999)) || a.name.localeCompare(b.name),
  );
  return { ...store, groups };
}

function normalizeGroupOrder(store: NexusTagStore): NexusTagStore {
  // Array order is authoritative. Mirror it into sequential order values for stability.
  const groups = store.groups.map((g, idx) => ({ ...g, order: idx }));
  return { ...store, groups };
}

export function loadTagStore(doc: Y.Doc): NexusTagStore {
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const match = current.match(BLOCK_RE);
  if (!match) return normalizeGroupOrder(ensureDefaultTags(ensureDefaultGroups({ ...DEFAULT_STORE })));

  try {
    const parsed = JSON.parse(match[1]);
    const nextGroupId = typeof parsed?.nextGroupId === 'number' ? parsed.nextGroupId : 1;
    const nextTagId = typeof parsed?.nextTagId === 'number' ? parsed.nextTagId : 1;
    const groupsRaw = Array.isArray(parsed?.groups) ? parsed.groups : [];
    const tagsRaw = Array.isArray(parsed?.tags) ? parsed.tags : [];

    const groups: NexusTagGroup[] = (groupsRaw as unknown[])
      .map((g: unknown): NexusTagGroup | null => {
        if (!g || typeof g !== "object") return null;
        const rec = g as Record<string, unknown>;
        if (typeof rec.id !== "string" || typeof rec.name !== "string") return null;
        const order = typeof rec.order === 'number' ? rec.order : undefined;
        return { id: rec.id, name: rec.name, order };
      })
      .filter((x): x is NexusTagGroup => x !== null);

    const tags: NexusTag[] = (tagsRaw as unknown[])
      .map((t: unknown) => {
        if (!t || typeof t !== "object") return null;
        const rec = t as Record<string, unknown>;
        if (typeof rec.id !== "string" || typeof rec.groupId !== "string" || typeof rec.name !== "string") return null;
        return { id: rec.id, groupId: rec.groupId, name: rec.name } satisfies NexusTag;
      })
      .filter((x): x is NexusTag => x !== null);

    return normalizeGroupOrder(
      sortGroupsByOrderForLoad(
        ensureDefaultTags(ensureDefaultGroups({ nextGroupId, nextTagId, groups, tags })),
      ),
    );
  } catch {
    return normalizeGroupOrder(ensureDefaultTags(ensureDefaultGroups({ ...DEFAULT_STORE })));
  }
}

export function saveTagStore(doc: Y.Doc, store: NexusTagStore): void {
  const yText = doc.getText('nexus');
  const current = yText.toString();

  const normalizedStore = normalizeGroupOrder(ensureDefaultTags(ensureDefaultGroups(store)));
  const block = `\`\`\`tag-store\n${JSON.stringify(normalizedStore, null, 2)}\n\`\`\``;

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

export function createTagGroup(doc: Y.Doc, name: string): NexusTagGroup | null {
  const trimmed = normalizeName(name);
  if (!trimmed) return null;
  const store = loadTagStore(doc);
  const group: NexusTagGroup = { id: `tg-${store.nextGroupId}`, name: trimmed };
  saveTagStore(doc, {
    ...store,
    nextGroupId: store.nextGroupId + 1,
    groups: [...store.groups, group],
  });
  return group;
}

export function reorderTagGroups(doc: Y.Doc, groupIdsInOrder: string[]): void {
  const store = loadTagStore(doc);
  const byId = new Map(store.groups.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const nextGroups: NexusTagGroup[] = [];
  groupIdsInOrder.forEach((id) => {
    const g = byId.get(id);
    if (!g) return;
    if (seen.has(id)) return;
    seen.add(id);
    nextGroups.push(g);
  });
  // Append any groups not included.
  store.groups.forEach((g) => {
    if (seen.has(g.id)) return;
    nextGroups.push(g);
  });
  saveTagStore(doc, { ...store, groups: nextGroups });
}

export function renameTagGroup(doc: Y.Doc, groupId: string, name: string): void {
  const trimmed = normalizeName(name);
  if (!trimmed) return;
  const store = loadTagStore(doc);
  if (!store.groups.some((g) => g.id === groupId)) return;
  saveTagStore(doc, {
    ...store,
    groups: store.groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)),
  });
}

export function deleteTagGroup(doc: Y.Doc, groupId: string): void {
  // Disallow deleting ungrouped; it's the safe landing zone.
  if (groupId === 'tg-ungrouped') return;
  const store = loadTagStore(doc);
  const ungroupedId = 'tg-ungrouped';
  saveTagStore(doc, {
    ...store,
    groups: store.groups.filter((g) => g.id !== groupId),
    // Move tags in the deleted group to ungrouped rather than deleting them.
    tags: store.tags.map((t) => (t.groupId === groupId ? { ...t, groupId: ungroupedId } : t)),
  });
}

export function createTag(doc: Y.Doc, groupId: string, name: string): NexusTag | null {
  const trimmed = normalizeName(name);
  if (!trimmed) return null;
  const store = loadTagStore(doc);
  if (!store.groups.some((g) => g.id === groupId)) return null;
  const tag: NexusTag = { id: `tag-${store.nextTagId}`, groupId, name: trimmed };
  saveTagStore(doc, {
    ...store,
    nextTagId: store.nextTagId + 1,
    tags: [...store.tags, tag],
  });
  return tag;
}

export function moveTagToGroup(doc: Y.Doc, tagId: string, groupId: string): void {
  const store = loadTagStore(doc);
  if (!store.tags.some((t) => t.id === tagId)) return;
  if (!store.groups.some((g) => g.id === groupId)) return;
  saveTagStore(doc, {
    ...store,
    tags: store.tags.map((t) => (t.id === tagId ? { ...t, groupId } : t)),
  });
}

export function renameTag(doc: Y.Doc, tagId: string, name: string): void {
  const trimmed = normalizeName(name);
  if (!trimmed) return;
  const store = loadTagStore(doc);
  if (!store.tags.some((t) => t.id === tagId)) return;
  saveTagStore(doc, {
    ...store,
    tags: store.tags.map((t) => (t.id === tagId ? { ...t, name: trimmed } : t)),
  });
}

export function deleteTag(doc: Y.Doc, tagId: string): void {
  const store = loadTagStore(doc);
  saveTagStore(doc, {
    ...store,
    tags: store.tags.filter((t) => t.id !== tagId),
  });
}

