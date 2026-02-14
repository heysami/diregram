'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Folder, FolderPlus, Pencil, Trash2, Plus, Mail, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AccessPeopleEditor } from '@/components/AccessPeopleEditor';
import {
  canEditFolder,
  canViewFolder,
  canEditFile,
  canViewFile,
  createLocalFile,
  createLocalFolder,
  deleteLocalFile,
  deleteLocalFolder,
  ensureLocalFileStore,
  renameLocalFile,
  renameLocalFolder,
  saveLocalFileStore,
  setFileAccess,
  setFolderAccess,
  touchLocalFile,
  type AccessPerson,
  type LocalFolder,
  type LocalFile,
  type LocalFileStore,
} from '@/lib/local-file-store';
import { saveFileSnapshot } from '@/lib/local-doc-snapshots';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';

type EditState = {
  folderId: string;
  name: string;
  people: AccessPerson[];
};

export function WorkspaceBrowser() {
  const router = useRouter();
  const { user } = useAuth();
  const userEmail = user?.email || null;

  // Hydration-safe local store load (matches FilesPanel pattern)
  const [store, setStore] = useState<LocalFileStore>(() => ({
    version: 5,
    folders: [],
    files: [],
    lastOpenedFileId: null,
  }));
  const [storeReady, setStoreReady] = useState(false);

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [editFile, setEditFile] = useState<{ fileId: string; name: string; people: AccessPerson[] } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Avoid synchronous setState in effect body (lint + perf):
    // load local storage snapshot on the next tick.
    const t = window.setTimeout(() => {
      setStore(ensureLocalFileStore());
      setStoreReady(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!storeReady) return;
    saveLocalFileStore(store);
  }, [store, storeReady]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, []);

  const rootFolders = useMemo(() => store.folders.filter((f) => f.parentId === null), [store.folders]);

  const visibleFolders = useMemo(() => {
    return rootFolders
      .filter((f) => canViewFolder(f, userEmail))
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [rootFolders, userEmail]);

  const activeFolder = useMemo(() => {
    if (!activeFolderId) return null;
    return store.folders.find((f) => f.id === activeFolderId) || null;
  }, [activeFolderId, store.folders]);

  const folderFiles = useMemo(() => {
    if (!activeFolder) return [];
    return store.files
      .filter((f) => f.folderId === activeFolder.id)
      .slice()
      .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
  }, [store.files, activeFolder]);

  const folderIsEmpty = (folderId: string) => {
    const hasFiles = store.files.some((f) => f.folderId === folderId);
    const hasChildren = store.folders.some((f) => f.parentId === folderId);
    return !hasFiles && !hasChildren;
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 1600);
  };

  const openFile = (fileId: string) => {
    setStore((prev) => touchLocalFile(prev, fileId));
    router.push(`/editor?file=${encodeURIComponent(fileId)}`);
  };

  const openEdit = (folder: LocalFolder) => {
    setEditError(null);
    setEditFile(null);
    setEdit({
      folderId: folder.id,
      name: folder.name,
      people: folder.access?.people || [],
    });
  };

  const commitEdit = () => {
    if (!edit) return;
    const name = edit.name.trim();
    if (!name) {
      setEditError('Folder name is required.');
      return;
    }
    const access = (edit.people || []).length === 0 ? undefined : { people: edit.people };
    setStore((prev) => setFolderAccess(renameLocalFolder(prev, edit.folderId, name), edit.folderId, access));
    setEdit(null);
    showToast('Saved');
  };

  const openEditFile = (file: LocalFile) => {
    setEditError(null);
    setEdit(null);
    setEditFile({ fileId: file.id, name: file.name, people: file.access?.people || [] });
  };

  const commitEditFile = () => {
    if (!editFile) return;
    const name = editFile.name.trim();
    if (!name) {
      setEditError('File name is required.');
      return;
    }
    const access = (editFile.people || []).length === 0 ? undefined : { people: editFile.people };
    setStore((prev) => setFileAccess(renameLocalFile(prev, editFile.fileId, name), editFile.fileId, access));
    setEditFile(null);
    showToast('Saved');
  };

  const inviteProject = async () => {
    if (!edit) return;
    const people = edit.people || [];
    if (people.length === 0) return showToast('Add someone first');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const lines = people.map((p) => `- ${p.email} (${p.role})`).join('\n');
    const body = `You’ve been invited to a Diregram project: ${edit.name}\n\nAccess:\n${lines}\n\nOpen Diregram: ${origin}\n`;
    const subject = `Diregram invite`;
    const to = people.map((p) => p.email).join(',');
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      showToast('Invite copied');
    } catch {
      // ignore
    }
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const cards = useMemo(() => {
    return visibleFolders.map((folder) => {
      const recent = store.files
        .filter((f) => f.folderId === folder.id && canViewFile(f, folder, userEmail))
        .slice()
        .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
        .slice(0, 3);
      return { folder, recent };
    });
  }, [visibleFolders, store.files, userEmail]);

  const canEditActiveFolder = activeFolder ? canEditFolder(activeFolder, userEmail) : true;

  return (
    <div className="w-full">
      {/* toast */}
      {toast ? (
        <div className="fixed left-1/2 top-[54px] z-50 -translate-x-1/2 mac-double-outline bg-white px-3 py-1 text-xs">
          {toast}
        </div>
      ) : null}

      {activeFolder ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" className="mac-btn flex items-center gap-1.5" onClick={() => setActiveFolderId(null)}>
                <ArrowLeft size={14} />
                Projects
              </button>
              <div className="text-sm font-bold tracking-tight flex items-center gap-2">
                <Folder size={16} />
                {activeFolder.name}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="mac-btn flex items-center gap-1.5"
                disabled={!canEditActiveFolder}
                title={!canEditActiveFolder ? 'No edit access' : 'New map'}
                onClick={() => {
                  if (!canEditActiveFolder) return;
                  setStore((prev) => {
                    const { store: next, file } = createLocalFile(prev, 'New Map', activeFolder.id);
                    queueMicrotask(() => openFile(file.id));
                    return next;
                  });
                }}
              >
                <Plus size={14} />
                New map
              </button>
              <button
                type="button"
                className="mac-btn flex items-center gap-1.5"
                disabled={!canEditActiveFolder}
                title={!canEditActiveFolder ? 'No edit access' : 'New grid'}
                onClick={() => {
                  if (!canEditActiveFolder) return;
                  setStore((prev) => {
                    const { store: next, file } = createLocalFile(prev, 'New Grid', activeFolder.id, 'grid');
                    // Pre-seed the document so the editor can restore it immediately.
                    saveFileSnapshot(file.id, makeStarterGridMarkdown());
                    queueMicrotask(() => openFile(file.id));
                    return next;
                  });
                }}
              >
                <Plus size={14} />
                New grid
              </button>
              <button
                type="button"
                className="mac-btn flex items-center gap-1.5"
                disabled={!canEditActiveFolder}
                title={!canEditActiveFolder ? 'No edit access' : 'Edit project'}
                onClick={() => openEdit(activeFolder)}
              >
                <Pencil size={14} />
                Edit
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            {folderFiles.length === 0 ? (
              <div className="mac-double-outline p-4 text-xs opacity-80">No maps yet.</div>
            ) : (
              folderFiles
                .filter((f) => canViewFile(f, activeFolder, userEmail))
                .map((f) => (
                <div
                  key={f.id}
                  className="mac-double-outline p-3 text-left hover:bg-gray-50 flex items-center justify-between gap-3 group"
                >
                  <button type="button" className="flex items-center gap-2 min-w-0 flex-1" onClick={() => openFile(f.id)} title="Open">
                    <FileText size={14} />
                    <div className="text-xs font-semibold truncate">{f.name}</div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-[11px] opacity-70 hidden sm:block">
                      {f.lastOpenedAt ? new Date(f.lastOpenedAt).toLocaleDateString() : ''}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(() => {
                        const canEditThisFile = canEditFile(f, activeFolder, userEmail) && canEditActiveFolder;
                        return (
                          <>
                            <button
                              type="button"
                              className="h-7 w-7 border flex items-center justify-center bg-white"
                              title={!canEditThisFile ? 'No edit access' : 'Edit'}
                              disabled={!canEditThisFile}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!canEditThisFile) return;
                                openEditFile(f);
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="h-7 w-7 border flex items-center justify-center bg-white"
                              title={!canEditThisFile ? 'No edit access' : 'Delete'}
                              disabled={!canEditThisFile}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!canEditThisFile) return;
                                setStore((prev) => deleteLocalFile(prev, f.id));
                                showToast('Deleted');
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold tracking-tight">Projects</div>
            <button
              type="button"
              className="mac-btn flex items-center gap-1.5"
              onClick={() => {
                setStore((prev) => createLocalFolder(prev, 'New Project', null));
                showToast('Project created');
              }}
            >
              <FolderPlus size={14} />
              New project
            </button>
          </div>

          <div className="grid gap-4 w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map(({ folder, recent }) => {
              const canEditThis = canEditFolder(folder, userEmail);
              const empty = folderIsEmpty(folder.id);
              return (
                <div
                  key={folder.id}
                  className="mac-window mac-double-outline p-5 group relative cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveFolderId(folder.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setActiveFolderId(folder.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Folder size={18} />
                        <div className="text-[14px] font-bold tracking-tight truncate">{folder.name}</div>
                      </div>
                      <div className="text-[11px] opacity-70 mt-1">{recent.length} recent</div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        className="h-7 w-7 border flex items-center justify-center bg-white"
                        title={!canEditThis ? 'No edit access' : 'Edit'}
                        disabled={!canEditThis}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEdit(folder);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="h-7 w-7 border flex items-center justify-center bg-white"
                        title={empty ? 'Delete' : 'Delete (folder not empty)'}
                        disabled={!empty}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStore((prev) => deleteLocalFolder(prev, folder.id));
                          showToast('Deleted');
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {recent.length === 0 ? (
                      <div className="text-xs opacity-70">No maps yet.</div>
                    ) : (
                      recent.map((f) => (
                        <div
                          key={f.id}
                          className="w-full mac-double-outline px-2 py-1 text-left text-xs hover:bg-gray-50 flex items-center justify-between gap-2 group/file"
                        >
                          <button
                            type="button"
                            className="flex items-center gap-2 min-w-0 flex-1"
                            title="Open"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openFile(f.id);
                            }}
                          >
                            <FileText size={12} />
                            <span className="truncate">{f.name}</span>
                          </button>
                          <div className="flex items-center gap-1 opacity-0 group-hover/file:opacity-100 transition-opacity">
                            <button
                              type="button"
                              className="h-6 w-6 border flex items-center justify-center bg-white"
                              title={!canEditFile(f, folder, userEmail) ? 'No edit access' : 'Edit'}
                              disabled={!canEditFile(f, folder, userEmail)}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!canEditFile(f, folder, userEmail)) return;
                                openEditFile(f);
                              }}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              className="h-6 w-6 border flex items-center justify-center bg-white"
                              title={!canEditFile(f, folder, userEmail) ? 'No edit access' : 'Delete'}
                              disabled={!canEditFile(f, folder, userEmail)}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!canEditFile(f, folder, userEmail)) return;
                                setStore((prev) => deleteLocalFile(prev, f.id));
                                showToast('Deleted');
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            className="absolute inset-0 bg-white/60"
            aria-label="Close"
            onClick={() => setEdit(null)}
          />
          <div className="relative mac-window mac-double-outline w-[720px] max-w-[96vw] overflow-hidden">
            <div className="mac-titlebar">
              <div className="mac-title">Edit project</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold">Name</div>
                <input
                  className="mac-field w-full"
                  value={edit.name}
                  onChange={(e) => setEdit((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                  placeholder="Folder name"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">Access</div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="h-7 w-7 border flex items-center justify-center" title="Invite (copy + email)" onClick={inviteProject}>
                      <Mail size={14} />
                    </button>
                    <button
                      type="button"
                      className="h-7 w-7 border flex items-center justify-center"
                      title="Copy list"
                      onClick={async () => {
                        const people = edit.people || [];
                        if (people.length === 0) return showToast('Add someone first');
                        const text = people.map((p) => `${p.email} (${p.role})`).join('\n');
                        try {
                          await navigator.clipboard.writeText(text);
                          showToast('Copied');
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                <AccessPeopleEditor
                  label="People"
                  value={edit.people || []}
                  onChange={(next) => setEdit((prev) => (prev ? { ...prev, people: next } : prev))}
                  error={editError}
                  onError={setEditError}
                />
              </div>

              {editError ? <div className="text-xs">{editError}</div> : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" className="mac-btn" onClick={() => setEdit(null)}>
                  Cancel
                </button>
                <button type="button" className="mac-btn mac-btn--primary" onClick={commitEdit}>
                  Save
                </button>
              </div>

              <div className="text-[11px] opacity-70">
                Note: invitations use your email client (mailto). Access is enforced in the UI for now.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            className="absolute inset-0 bg-white/60"
            aria-label="Close"
            onClick={() => setEditFile(null)}
          />
          <div className="relative mac-window mac-double-outline w-[560px] max-w-[96vw] overflow-hidden">
            <div className="mac-titlebar">
              <div className="mac-title">Edit map</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold">Name</div>
                <input
                  className="mac-field w-full"
                  value={editFile.name}
                  onChange={(e) => setEditFile((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                  placeholder="Map name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitEditFile();
                    }
                  }}
                />
              </div>

              <AccessPeopleEditor
                label="Access"
                value={editFile.people || []}
                onChange={(next) => setEditFile((prev) => (prev ? { ...prev, people: next } : prev))}
                error={editError}
                onError={setEditError}
              />

              {editError ? <div className="text-xs">{editError}</div> : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" className="mac-btn" onClick={() => setEditFile(null)}>
                  Cancel
                </button>
                <button type="button" className="mac-btn mac-btn--primary" onClick={commitEditFile}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

