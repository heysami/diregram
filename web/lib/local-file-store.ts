export type LocalFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  access?: LocalAccessControl;
};

export type LocalFile = {
  id: string;
  name: string;
  folderId: string | null;
  /** Hocuspocus document name */
  roomName: string;
  /** Per-file layout direction (default: horizontal/right) */
  layoutDirection?: 'horizontal' | 'vertical';
  createdAt: number;
  lastOpenedAt: number;
  access?: LocalAccessControl;
};

export type LocalFileStore = {
  version: 4;
  folders: LocalFolder[];
  files: LocalFile[];
  lastOpenedFileId: string | null;
};

const STORAGE_KEY = 'nexusmap.localFileStore.v1';

export type AccessRole = 'view' | 'edit';
export type AccessPerson = { email: string; role: AccessRole };
export type LocalAccessControl = { people: AccessPerson[] };

function uuid(): string {
  return (typeof window !== 'undefined' && window.crypto?.randomUUID?.()) || `id-${Math.random().toString(16).slice(2)}`;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
}

function now() {
  return Date.now();
}

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function roleFromUnknown(v: unknown): AccessRole {
  return v === 'edit' ? 'edit' : 'view';
}

function parsePeople(v: unknown): AccessPerson[] {
  if (!Array.isArray(v)) return [];
  const out: AccessPerson[] = [];
  const bestRoleByEmail = new Map<string, AccessRole>();
  v.forEach((p) => {
    if (!p || typeof p !== 'object') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pp: any = p;
    const email = typeof pp.email === 'string' ? normalizeEmail(pp.email) : '';
    if (!email) return;
    const role = roleFromUnknown(pp.role);
    const prev = bestRoleByEmail.get(email);
    // edit outranks view
    if (!prev || (prev === 'view' && role === 'edit')) bestRoleByEmail.set(email, role);
  });
  bestRoleByEmail.forEach((role, email) => out.push({ email, role }));
  out.sort((a, b) => a.email.localeCompare(b.email));
  return out;
}

function peopleFromViewerEditorLists(viewers: unknown, editors: unknown): AccessPerson[] {
  const v = asStringArray(viewers).map(normalizeEmail).filter(Boolean);
  const e = asStringArray(editors).map(normalizeEmail).filter(Boolean);
  const map = new Map<string, AccessRole>();
  v.forEach((email) => map.set(email, 'view'));
  e.forEach((email) => map.set(email, 'edit')); // override to edit
  return Array.from(map.entries())
    .map(([email, role]) => ({ email, role }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

function migrateAccess(accessRaw: unknown): LocalAccessControl | undefined {
  if (!accessRaw || typeof accessRaw !== 'object') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: any = accessRaw;
  if (a.people) {
    const people = parsePeople(a.people);
    return people.length ? { people } : undefined;
  }
  // v2 shape: { viewers:[], editors:[] }
  const people = peopleFromViewerEditorLists(a.viewers, a.editors);
  return people.length ? { people } : undefined;
}

function migrate(raw: unknown): LocalFileStore | null {
  if (!raw || typeof raw !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = raw;
  const version = r.version;
  const foldersRaw = Array.isArray(r.folders) ? r.folders : [];
  const filesRaw = Array.isArray(r.files) ? r.files : [];
  const lastOpenedFileId = typeof r.lastOpenedFileId === 'string' ? r.lastOpenedFileId : null;

  const folders: LocalFolder[] = foldersRaw
    .filter((f: unknown) => f && typeof f === 'object')
    .map((f: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ff: any = f;
      const access = migrateAccess(ff.access);
      return {
        id: typeof ff.id === 'string' ? ff.id : uuid(),
        name: typeof ff.name === 'string' ? ff.name : 'Folder',
        parentId: typeof ff.parentId === 'string' ? ff.parentId : null,
        createdAt: typeof ff.createdAt === 'number' ? ff.createdAt : now(),
        access,
      };
    });

  const files: LocalFile[] = filesRaw
    .filter((f: unknown) => f && typeof f === 'object')
    .map((f: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ff: any = f;
      const createdAt = typeof ff.createdAt === 'number' ? ff.createdAt : now();
      const lastOpenedAt = typeof ff.lastOpenedAt === 'number' ? ff.lastOpenedAt : createdAt;
      const layoutDirection = ff.layoutDirection === 'vertical' ? 'vertical' : 'horizontal';
      return {
        id: typeof ff.id === 'string' ? ff.id : uuid(),
        name: typeof ff.name === 'string' ? ff.name : 'Map',
        folderId: typeof ff.folderId === 'string' ? ff.folderId : null,
        roomName: typeof ff.roomName === 'string' ? ff.roomName : `file-${uuid()}`,
        layoutDirection,
        createdAt,
        lastOpenedAt,
        access: migrateAccess(ff.access),
      };
    });

  // v1/v2/v3/v4 -> v4: normalize ACLs + layoutDirection and bump version
  if (version === 1 || version === 2 || version === 3 || version === 4) {
    return { version: 4, folders, files, lastOpenedFileId };
  }
  return null;
}

export function loadLocalFileStore(): LocalFileStore {
  if (typeof window === 'undefined') {
    return { version: 4, folders: [], files: [], lastOpenedFileId: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const migrated = migrate(parsed);
      if (migrated) return migrated;
    }
  } catch {
    // ignore
  }
  const createdAt = now();
  const rootFolder: LocalFolder = { id: uuid(), name: 'My Projects', parentId: null, createdAt };
  const demo: LocalFile = {
    id: uuid(),
    name: 'Demo Map',
    folderId: rootFolder.id,
    roomName: 'file-demo',
    layoutDirection: 'horizontal',
    createdAt,
    lastOpenedAt: createdAt,
  };
  const initial: LocalFileStore = { version: 4, folders: [rootFolder], files: [demo], lastOpenedFileId: demo.id };
  saveLocalFileStore(initial);
  return initial;
}

export function saveLocalFileStore(store: LocalFileStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function ensureLocalFileStore(): LocalFileStore {
  const store = loadLocalFileStore();
  if (store.files.length > 0) return store;
  const createdAt = now();
  const rootFolder: LocalFolder = { id: uuid(), name: 'My Projects', parentId: null, createdAt };
  const demo: LocalFile = {
    id: uuid(),
    name: 'Demo Map',
    folderId: rootFolder.id,
    roomName: 'file-demo',
    layoutDirection: 'horizontal',
    createdAt,
    lastOpenedAt: createdAt,
  };
  const next: LocalFileStore = { version: 4, folders: [rootFolder], files: [demo], lastOpenedFileId: demo.id };
  saveLocalFileStore(next);
  return next;
}

export function createLocalFolder(store: LocalFileStore, name: string, parentId: string | null): LocalFileStore {
  const folder: LocalFolder = { id: uuid(), name: name.trim() || 'New Folder', parentId: parentId ?? null, createdAt: now() };
  return { ...store, folders: [...store.folders, folder] };
}

export function createLocalFile(store: LocalFileStore, name: string, folderId: string | null): { store: LocalFileStore; file: LocalFile } {
  const createdAt = now();
  const file: LocalFile = {
    id: uuid(),
    name: name.trim() || 'New Map',
    folderId,
    roomName: `file-${uuid()}`,
    layoutDirection: 'horizontal',
    createdAt,
    lastOpenedAt: createdAt,
  };
  const next: LocalFileStore = { ...store, files: [...store.files, file], lastOpenedFileId: file.id };
  return { store: next, file };
}

export function setLocalFileLayoutDirection(
  store: LocalFileStore,
  fileId: string,
  layoutDirection: 'horizontal' | 'vertical',
): LocalFileStore {
  const idx = store.files.findIndex((f) => f.id === fileId);
  if (idx === -1) return store;
  const cur = store.files[idx];
  if (cur.layoutDirection === layoutDirection) return store;
  const nextFiles = store.files.slice();
  nextFiles[idx] = { ...cur, layoutDirection };
  return { ...store, files: nextFiles };
}

export function renameLocalFile(store: LocalFileStore, fileId: string, nextNameRaw: string): LocalFileStore {
  const nextName = nextNameRaw.trim();
  if (!nextName) return store;
  const idx = store.files.findIndex((f) => f.id === fileId);
  if (idx === -1) return store;
  const cur = store.files[idx];
  if (cur.name === nextName) return store;
  const nextFiles = store.files.slice();
  nextFiles[idx] = { ...cur, name: nextName };
  return { ...store, files: nextFiles };
}

export function deleteLocalFile(store: LocalFileStore, fileId: string): LocalFileStore {
  const exists = store.files.some((f) => f.id === fileId);
  if (!exists) return store;
  const nextFiles = store.files.filter((f) => f.id !== fileId);
  const nextLastOpened = store.lastOpenedFileId === fileId ? null : store.lastOpenedFileId;
  return { ...store, files: nextFiles, lastOpenedFileId: nextLastOpened };
}

export function touchLocalFile(store: LocalFileStore, fileId: string): LocalFileStore {
  const idx = store.files.findIndex((f) => f.id === fileId);
  if (idx === -1) return store;
  const nextFiles = store.files.slice();
  nextFiles[idx] = { ...nextFiles[idx], lastOpenedAt: now() };
  return { ...store, files: nextFiles, lastOpenedFileId: fileId };
}

export function renameLocalFolder(store: LocalFileStore, folderId: string, nextNameRaw: string): LocalFileStore {
  const nextName = nextNameRaw.trim();
  if (!nextName) return store;
  const idx = store.folders.findIndex((f) => f.id === folderId);
  if (idx === -1) return store;
  const cur = store.folders[idx];
  if (cur.name === nextName) return store;
  const nextFolders = store.folders.slice();
  nextFolders[idx] = { ...cur, name: nextName };
  return { ...store, folders: nextFolders };
}

export function deleteLocalFolder(store: LocalFileStore, folderId: string): LocalFileStore {
  const hasFiles = store.files.some((f) => f.folderId === folderId);
  const hasChildren = store.folders.some((f) => f.parentId === folderId);
  if (hasFiles || hasChildren) return store;
  return { ...store, folders: store.folders.filter((f) => f.id !== folderId) };
}

export function setFolderAccess(
  store: LocalFileStore,
  folderId: string,
  access: LocalAccessControl | undefined,
): LocalFileStore {
  const idx = store.folders.findIndex((f) => f.id === folderId);
  if (idx === -1) return store;
  const nextFolders = store.folders.slice();
  nextFolders[idx] = { ...nextFolders[idx], access };
  return { ...store, folders: nextFolders };
}

export function setFileAccess(store: LocalFileStore, fileId: string, access: LocalAccessControl | undefined): LocalFileStore {
  const idx = store.files.findIndex((f) => f.id === fileId);
  if (idx === -1) return store;
  const nextFiles = store.files.slice();
  nextFiles[idx] = { ...nextFiles[idx], access };
  return { ...store, files: nextFiles };
}

export function canViewFolder(folder: LocalFolder, userEmail?: string | null) {
  const people = folder.access?.people || [];
  // Open by default if no ACL configured.
  if (people.length === 0) return true;
  if (!userEmail) return false;
  const e = userEmail.trim().toLowerCase();
  return people.some((p) => p.email.toLowerCase() === e);
}

export function canEditFolder(folder: LocalFolder, userEmail?: string | null) {
  const people = folder.access?.people || [];
  if (people.length === 0) return true; // open-by-default
  if (!userEmail) return false;
  const e = userEmail.trim().toLowerCase();
  return people.some((p) => p.email.toLowerCase() === e && p.role === 'edit');
}

export function canViewFile(file: LocalFile, folder: LocalFolder | null, userEmail?: string | null) {
  const people = file.access?.people || [];
  if (people.length > 0) {
    if (!userEmail) return false;
    const e = userEmail.trim().toLowerCase();
    return people.some((p) => p.email.toLowerCase() === e);
  }
  // fall back to folder ACL
  if (folder) return canViewFolder(folder, userEmail);
  return true;
}

export function canEditFile(file: LocalFile, folder: LocalFolder | null, userEmail?: string | null) {
  const people = file.access?.people || [];
  if (people.length > 0) {
    if (!userEmail) return false;
    const e = userEmail.trim().toLowerCase();
    return people.some((p) => p.email.toLowerCase() === e && p.role === 'edit');
  }
  if (folder) return canEditFolder(folder, userEmail);
  return true;
}
