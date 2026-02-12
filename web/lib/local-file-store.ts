export type LocalFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

export type LocalFile = {
  id: string;
  name: string;
  folderId: string | null;
  /** Hocuspocus document name */
  roomName: string;
};

export type LocalFileStore = {
  version: 1;
  folders: LocalFolder[];
  files: LocalFile[];
  lastOpenedFileId: string | null;
};

const STORAGE_KEY = 'nexusmap.localFileStore.v1';

function uuid(): string {
  return (typeof window !== 'undefined' && window.crypto?.randomUUID?.()) || `id-${Math.random().toString(16).slice(2)}`;
}

export function loadLocalFileStore(): LocalFileStore {
  if (typeof window === 'undefined') {
    return { version: 1, folders: [], files: [], lastOpenedFileId: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocalFileStore;
  } catch {
    // ignore
  }
  const rootFolder: LocalFolder = { id: uuid(), name: 'My Maps', parentId: null };
  const demo: LocalFile = { id: uuid(), name: 'Demo Map', folderId: rootFolder.id, roomName: 'file-demo' };
  const initial: LocalFileStore = { version: 1, folders: [rootFolder], files: [demo], lastOpenedFileId: demo.id };
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
  const rootFolder: LocalFolder = { id: uuid(), name: 'My Maps', parentId: null };
  const demo: LocalFile = { id: uuid(), name: 'Demo Map', folderId: rootFolder.id, roomName: 'file-demo' };
  const next: LocalFileStore = { version: 1, folders: [rootFolder], files: [demo], lastOpenedFileId: demo.id };
  saveLocalFileStore(next);
  return next;
}

export function createLocalFolder(store: LocalFileStore, name: string, parentId: string | null): LocalFileStore {
  const folder: LocalFolder = { id: uuid(), name: name.trim() || 'New Folder', parentId };
  return { ...store, folders: [...store.folders, folder] };
}

export function createLocalFile(store: LocalFileStore, name: string, folderId: string | null): { store: LocalFileStore; file: LocalFile } {
  const file: LocalFile = { id: uuid(), name: name.trim() || 'New Map', folderId, roomName: `file-${uuid()}` };
  const next: LocalFileStore = { ...store, files: [...store.files, file], lastOpenedFileId: file.id };
  return { store: next, file };
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

