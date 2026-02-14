'use client';

import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, FilePlus, ChevronRight, ChevronDown } from 'lucide-react';
import {
  ensureLocalFileStore,
  saveLocalFileStore,
  type LocalFile,
  type LocalFolder,
  type LocalFileStore,
  createLocalFile,
  createLocalFolder,
  renameLocalFile,
} from '@/lib/local-file-store';

type Props = {
  activeFileId: string | null;
  onOpenFile: (file: LocalFile) => void;
};

export function FilesPanel({ activeFileId, onOpenFile }: Props) {
  // IMPORTANT (hydration correctness):
  // - Client Components are still pre-rendered on the server.
  // - `ensureLocalFileStore()` uses `window` + `Math.random()` (uuid fallback), so calling it during
  //   initial render can cause server HTML to differ from client HTML -> hydration mismatch.
  // - Therefore we render a deterministic empty store first, then load the real store after mount.
  const [store, setStore] = useState<LocalFileStore>(() => ({
    version: 5,
    folders: [],
    files: [],
    lastOpenedFileId: null,
  }));
  const [storeReady, setStoreReady] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [localSelectedFileId, setLocalSelectedFileId] = useState<string | null>(null);

  const selectedFileId = activeFileId ?? localSelectedFileId;
  const selectedFile = selectedFileId ? store.files.find((f) => f.id === selectedFileId) || null : null;

  useEffect(() => {
    // Load from localStorage after mount so SSR + first client render match.
    // This also ensures we don't generate random ids during server pre-render.
    setStore(ensureLocalFileStore());
    setStoreReady(true);
  }, []);

  useEffect(() => {
    // Only persist after we've loaded the real store.
    if (!storeReady) return;
    saveLocalFileStore(store);
  }, [store, storeReady]);

  const folderById = useMemo(() => new Map(store.folders.map((f) => [f.id, f])), [store.folders]);
  const filesByFolder = useMemo(() => {
    const map = new Map<string | null, LocalFile[]>();
    store.files.forEach((f) => {
      const key = f.folderId ?? null;
      map.set(key, [...(map.get(key) || []), f]);
    });
    // Sort by name for stability
    map.forEach((arr, k) => map.set(k, arr.slice().sort((a, b) => a.name.localeCompare(b.name))));
    return map;
  }, [store.files]);

  const childrenByFolder = useMemo(() => {
    const map = new Map<string | null, LocalFolder[]>();
    store.folders.forEach((f) => {
      const key = f.parentId ?? null;
      map.set(key, [...(map.get(key) || []), f]);
    });
    map.forEach((arr, k) => map.set(k, arr.slice().sort((a, b) => a.name.localeCompare(b.name))));
    return map;
  }, [store.folders]);

  const toggleExpanded = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderFolder = (folder: LocalFolder, depth: number) => {
    const isOpen = expandedFolderIds.has(folder.id);
    const children = childrenByFolder.get(folder.id) || [];
    const files = filesByFolder.get(folder.id) || [];
    return (
      <div key={folder.id}>
        <button
          type="button"
          onClick={() => toggleExpanded(folder.id)}
          className="w-full flex items-center gap-1 text-left text-xs px-2 py-1 hover:bg-gray-50"
          style={{ paddingLeft: 8 + depth * 14 }}
          title={folder.name}
        >
          {children.length || files.length ? (
            isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="inline-block w-3" />
          )}
          <span className="font-semibold truncate">{folder.name}</span>
        </button>
        {isOpen ? (
          <div>
            {files.map((f) => (
              <div key={f.id} className="w-full" style={{ paddingLeft: 24 + depth * 14 }}>
                {renamingFileId === f.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenamingFileId(null);
                        setRenameDraft('');
                        return;
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setStore((prev) => renameLocalFile(prev, f.id, renameDraft));
                        setRenamingFileId(null);
                        setRenameDraft('');
                      }
                    }}
                    onBlur={() => {
                      setStore((prev) => renameLocalFile(prev, f.id, renameDraft));
                      setRenamingFileId(null);
                      setRenameDraft('');
                    }}
                    className="mac-field h-7 w-full text-xs"
                    placeholder="File name…"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setStore((prev) => ({ ...prev, lastOpenedFileId: f.id }));
                      setLocalSelectedFileId(f.id);
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenFile(f);
                    }}
                    className={`w-full text-left text-xs px-2 py-1 ${
                      selectedFileId === f.id ? 'mac-fill--hatch mac-shadow-hard' : 'hover:bg-gray-50'
                    }`}
                    title="Click to select · Double-click to open"
                  >
                    {f.name}
                  </button>
                )}
              </div>
            ))}
            {children.map((c) => renderFolder(c, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="mac-window w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden flex flex-col"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'F2' && selectedFile) {
          e.preventDefault();
          setRenamingFileId(selectedFile.id);
          setRenameDraft(selectedFile.name);
        }
        if (e.key === 'Enter' && selectedFile) {
          e.preventDefault();
          onOpenFile(selectedFile);
        }
      }}
    >
      <div className="mac-titlebar">
        <div className="mac-title">Workspace</div>
      </div>
      <div className="mac-toolstrip justify-between">
        <div className="text-[11px] opacity-70">Double-click to open</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="mac-btn"
            title="Rename selected file (F2)"
            disabled={!selectedFile}
            onClick={() => {
              if (!selectedFile) return;
              setRenamingFileId(selectedFile.id);
              setRenameDraft(selectedFile.name);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="h-6 w-6 border flex items-center justify-center"
            title="New folder"
            onClick={() => {
              setStore((prev) => createLocalFolder(prev, 'New Folder', null));
            }}
          >
            <FolderPlus size={14} />
          </button>
          <button
            type="button"
            className="h-6 w-6 border flex items-center justify-center"
            title="New file"
            onClick={() => {
              setStore((prev) => {
                const { store: next, file } = createLocalFile(prev, 'New Map', null);
                // Auto-open new file
                queueMicrotask(() => onOpenFile(file));
                return next;
              });
            }}
          >
            <FilePlus size={14} />
          </button>
        </div>
      </div>
      <div className="p-2 overflow-auto flex-1">
        {(childrenByFolder.get(null) || []).map((f) => renderFolder(f, 0))}
        {(filesByFolder.get(null) || []).map((f) => (
          <div key={f.id}>
            {renamingFileId === f.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenamingFileId(null);
                    setRenameDraft('');
                    return;
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setStore((prev) => renameLocalFile(prev, f.id, renameDraft));
                    setRenamingFileId(null);
                    setRenameDraft('');
                  }
                }}
                onBlur={() => {
                  setStore((prev) => renameLocalFile(prev, f.id, renameDraft));
                  setRenamingFileId(null);
                  setRenameDraft('');
                }}
                className="mac-field h-7 w-full text-xs"
                placeholder="File name…"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStore((prev) => ({ ...prev, lastOpenedFileId: f.id }));
                  setLocalSelectedFileId(f.id);
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenFile(f);
                }}
                className={`w-full text-left text-xs px-2 py-1 ${
                  selectedFileId === f.id ? 'mac-fill--hatch mac-shadow-hard' : 'hover:bg-gray-50'
                }`}
                title="Click to select · Double-click to open"
              >
                {f.name}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

