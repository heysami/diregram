'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileText, Folder, FolderPlus, Pencil, Trash2, Plus, Mail, Copy, Network, Eye, Table, LayoutTemplate, FlaskConical } from 'lucide-react';
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
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';
import { makeStarterNoteMarkdown } from '@/lib/note-starter';
import { makeStarterVisionMarkdown } from '@/lib/vision-starter';
import { makeStarterTestMarkdown } from '@/lib/test-starter';
import type { DocKind } from '@/lib/doc-kinds';
import { NewFromTemplateModal } from '@/components/templates/NewFromTemplateModal';
import { ProjectActionMenus } from '@/components/workspace/ProjectActionMenus';
import { ImportMermaidModal } from '@/components/mermaid/ImportMermaidModal';
import { downloadProjectBundleZip, exportProjectBundleZip } from '@/lib/export-bundle';
import { exportKgAndVectorsForProject } from '@/lib/kg-vector-export';
import { SemanticKgViewerModal } from '@/components/kg/SemanticKgViewerModal';

function normalizeKind(raw: unknown): DocKind {
  return raw === 'note' || raw === 'grid' || raw === 'vision' || raw === 'diagram' || raw === 'template' || raw === 'test' ? raw : 'diagram';
}

function KindIcon({ kind, size }: { kind: unknown; size: number }) {
  const k = normalizeKind(kind);
  if (k === 'grid') return <Table size={size} />;
  if (k === 'note') return <FileText size={size} />;
  if (k === 'vision') return <Eye size={size} />;
  if (k === 'template') return <LayoutTemplate size={size} />;
  if (k === 'test') return <FlaskConical size={size} />;
  return <Network size={size} />;
}

type EditState = {
  folderId: string;
  name: string;
  people: AccessPerson[];
};

export function WorkspaceBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [newFromTemplateOpen, setNewFromTemplateOpen] = useState(false);
  const [importMermaidOpen, setImportMermaidOpen] = useState(false);
  const [projectTab, setProjectTab] = useState<'files' | 'templates'>('files');
  const [templateScope, setTemplateScope] = useState<'project' | 'account'>('project');
  const [kgViewerOpen, setKgViewerOpen] = useState(false);
  const [kgExportResult, setKgExportResult] = useState<Awaited<ReturnType<typeof exportKgAndVectorsForProject>> | null>(null);

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

  // Keep the active project in the URL so humans can share/open it.
  useEffect(() => {
    const fromUrl = String(searchParams?.get('project') || '').trim();
    if (fromUrl && !activeFolderId) {
      if (store.folders.some((f) => f.id === fromUrl)) setActiveFolderId(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.folders, searchParams]);

  useEffect(() => {
    const cur = String(searchParams?.get('project') || '').trim();
    const next = activeFolderId ? String(activeFolderId) : '';
    if (next === cur) return;
    if (next) router.replace(`/workspace?project=${encodeURIComponent(next)}`);
    else router.replace('/workspace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, []);

  // Project header dropdowns are encapsulated in `ProjectActionMenus`.

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

  const projectTemplatesFolderId = useMemo(() => {
    if (!activeFolder) return null;
    return store.folders.find((f) => f.parentId === activeFolder.id && f.name === 'Templates')?.id || null;
  }, [activeFolder, store.folders]);

  const accountTemplatesFolderId = useMemo(() => {
    return store.folders.find((f) => f.parentId === null && f.name === 'Account Templates')?.id || null;
  }, [store.folders]);

  useEffect(() => {
    if (projectTab !== 'templates') return;
    if (templateScope === 'project') {
      if (!activeFolder) return;
      if (projectTemplatesFolderId) return;
      // Create on-demand when user opens Templates tab.
      setStore((prev) => createLocalFolder(prev, 'Templates', activeFolder.id));
      return;
    }
    // account scope
    if (accountTemplatesFolderId) return;
    setStore((prev) => createLocalFolder(prev, 'Account Templates', null));
  }, [activeFolder, accountTemplatesFolderId, projectTab, projectTemplatesFolderId, templateScope]);

  useEffect(() => {
    if (!newFromTemplateOpen) return;
    if (templateScope === 'project') {
      if (!activeFolder) return;
      if (projectTemplatesFolderId) return;
      setStore((prev) => createLocalFolder(prev, 'Templates', activeFolder.id));
      return;
    }
    if (accountTemplatesFolderId) return;
    setStore((prev) => createLocalFolder(prev, 'Account Templates', null));
  }, [accountTemplatesFolderId, activeFolder, newFromTemplateOpen, projectTemplatesFolderId, templateScope]);

  const activeTemplatesFolderId = templateScope === 'account' ? accountTemplatesFolderId : projectTemplatesFolderId;

  const templateFiles = useMemo(() => {
    if (!activeTemplatesFolderId) return [];
    return store.files
      .filter((f) => f.folderId === activeTemplatesFolderId)
      .slice()
      .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
  }, [store.files, activeTemplatesFolderId]);

  const shownFiles = projectTab === 'templates' ? templateFiles : folderFiles;

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
              <div className="flex items-center gap-1 rounded border bg-white p-0.5">
                <button
                  type="button"
                  className={`mac-btn h-8 ${projectTab === 'files' ? 'mac-btn--primary' : ''}`}
                  onClick={() => setProjectTab('files')}
                  title="Project files"
                >
                  Files
                </button>
                <button
                  type="button"
                  className={`mac-btn h-8 ${projectTab === 'templates' ? 'mac-btn--primary' : ''}`}
                  onClick={() => setProjectTab('templates')}
                  title="Project templates"
                >
                  Templates
                </button>
              </div>
              {projectTab === 'templates' ? (
                <select
                  className="mac-field h-8"
                  value={templateScope}
                  onChange={(e) => setTemplateScope(e.target.value as any)}
                  title="Template library"
                >
                  <option value="project">This project</option>
                  <option value="account">Account</option>
                </select>
              ) : null}

              <ProjectActionMenus
                projectTab={projectTab}
                canEdit={canEditActiveFolder}
                onNewMap={() => {
                  if (!canEditActiveFolder) return;
                  setStore((prev) => {
                    const { store: next, file } = createLocalFile(prev, 'New Map', activeFolder.id);
                    queueMicrotask(() => openFile(file.id));
                    return next;
                  });
                }}
                onNewFromTemplate={() => {
                  if (!canEditActiveFolder) return;
                  setNewFromTemplateOpen(true);
                }}
                onImportMermaidDiagram={() => setImportMermaidOpen(true)}
                onNewGrid={() => {
                  if (!canEditActiveFolder) return;
                  setStore((prev) => {
                    const { store: next, file } = createLocalFile(prev, 'New Grid', activeFolder.id, 'grid');
                    saveFileSnapshot(file.id, makeStarterGridMarkdown());
                    queueMicrotask(() => openFile(file.id));
                    return next;
                  });
                }}
                onNewNote={() => {
                  if (!canEditActiveFolder) return;
                  setStore((prev) => {
                    const { store: next, file } = createLocalFile(prev, 'New Note', activeFolder.id, 'note');
                    saveFileSnapshot(file.id, makeStarterNoteMarkdown());
                    queueMicrotask(() => openFile(file.id));
                    return next;
                  });
                }}
                onNewVision={() => {
                  if (!canEditActiveFolder) return;
                  setStore((prev) => {
                    const { store: next, file } = createLocalFile(prev, 'New Vision', activeFolder.id, 'vision');
                    saveFileSnapshot(file.id, makeStarterVisionMarkdown());
                    queueMicrotask(() => openFile(file.id));
                    return next;
                  });
                }}
                onNewTest={() => {
                  if (!canEditActiveFolder) return;
                  setStore((prev) => {
                    const { store: next, file } = createLocalFile(prev, 'New Test', activeFolder.id, 'test');
                    saveFileSnapshot(file.id, makeStarterTestMarkdown());
                    queueMicrotask(() => openFile(file.id));
                    return next;
                  });
                }}
                onCopyMcpAccountUrl={undefined}
                onCopyProjectLink={async () => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : '';
                  if (!origin) return;
                  try {
                    await navigator.clipboard.writeText(`${origin}/workspace?project=${encodeURIComponent(activeFolder.id)}`);
                    showToast('Copied');
                  } catch {
                    showToast('Copy failed');
                  }
                }}
                onExportBundle={async () => {
                  const includeKgVectors = confirm('Include KG + embeddings outputs in the bundle?');
                  const out = await exportProjectBundleZip({
                    supabaseMode: false,
                    supabase: null,
                    projectFolderId: activeFolder.id,
                    includeKgVectors,
                  });
                  downloadProjectBundleZip(out);
                  showToast('Exported');
                }}
                onExportKg={async () => {
                  const res = await exportKgAndVectorsForProject({
                    supabaseMode: false,
                    supabase: null,
                    projectFolderId: activeFolder.id,
                  });
                  setKgExportResult(res);
                  setKgViewerOpen(true);
                  showToast('Exported');
                }}
                onEditProject={() => {
                  if (!canEditActiveFolder) return;
                  openEdit(activeFolder);
                }}
              />
            </div>
          </div>

          <NewFromTemplateModal
            open={newFromTemplateOpen}
            title="New from template"
            files={templateFiles.map((f) => ({
              id: String(f.id),
              name: String(f.name || 'Untitled'),
              kind: normalizeKind(f.kind),
            }))}
            loadMarkdown={async (fileId) => loadFileSnapshot(fileId) || ''}
            scope={{
              value: templateScope,
              options: [
                { id: 'project', label: 'This project' },
                { id: 'account', label: 'Account' },
              ],
              onChange: (next) => setTemplateScope(next as any),
            }}
            onClose={() => setNewFromTemplateOpen(false)}
            onCreate={async ({ name, kind, content }) => {
              // MVP: create a new file seeded with the rendered template payload.
              // (append/fragment apply is implemented later.)
              const safeKind: DocKind = normalizeKind(kind);
              setStore((prev) => {
                const { store: next, file } = createLocalFile(prev, name, activeFolder.id, safeKind);
                saveFileSnapshot(file.id, content);
                queueMicrotask(() => openFile(file.id));
                return next;
              });
            }}
          />

          <ImportMermaidModal
            open={importMermaidOpen}
            onClose={() => setImportMermaidOpen(false)}
            onCreate={async ({ name, content }) => {
              setStore((prev) => {
                const { store: next, file } = createLocalFile(prev, name, activeFolder.id, 'diagram');
                saveFileSnapshot(file.id, content);
                queueMicrotask(() => openFile(file.id));
                return next;
              });
            }}
          />

          <SemanticKgViewerModal
            open={kgViewerOpen}
            onClose={() => setKgViewerOpen(false)}
            exportResult={kgExportResult}
            basename={`diregram-${activeFolder.id}`}
          />

          <div className="grid gap-2">
            {shownFiles.filter((f) => canViewFile(f, activeFolder, userEmail)).length === 0 ? (
              <div className="mac-double-outline p-4 text-xs opacity-80">
                {projectTab === 'templates' ? 'No templates yet.' : 'No maps yet.'}
              </div>
            ) : (
              shownFiles
                .filter((f) => canViewFile(f, activeFolder, userEmail))
                .map((f, idx) => (
                <div
                  key={f.id}
                  className="mac-double-outline mac-interactive-row p-3 text-left flex items-center justify-between gap-3 group dg-reveal-card"
                  style={{
                    '--dg-reveal-delay': `${Math.min(idx, 12) * 70}ms`,
                    '--dg-reveal-jx': `${((idx * 23) % 13) - 6}px`,
                    '--dg-reveal-jy': `${((idx * 41) % 13) - 6}px`,
                    '--dg-reveal-jr': `${((idx * 19) % 11) - 5}deg`,
                    '--dg-reveal-js': `${1 + ((((idx * 13) % 7) - 3) * 0.015)}`,
                  } as any}
                >
                  <div className="dg-reveal-card__content flex items-center justify-between gap-3 w-full">
                    <button type="button" className="flex items-center gap-2 min-w-0 flex-1" onClick={() => openFile(f.id)} title="Open">
                      <KindIcon kind={f.kind} size={14} />
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
                                className="mac-btn mac-btn--icon"
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
                                className="mac-btn mac-btn--icon"
                                title={!canEditThisFile ? 'No edit access' : 'Delete'}
                                disabled={!canEditThisFile}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!canEditThisFile) return;
                                  setStore((prev) => {
                                    const next = deleteLocalFile(prev, f.id);
                                    return next;
                                  });
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
	            {cards.map(({ folder, recent }, idx) => {
	              const canEditThis = canEditFolder(folder, userEmail);
	              const empty = folderIsEmpty(folder.id);
	              return (
	                <div
	                  key={folder.id}
	                  className="mac-window mac-double-outline mac-interactive-row p-5 group relative cursor-pointer dg-reveal-card"
	                  style={{
	                    '--dg-reveal-delay': `${Math.min(idx, 10) * 90}ms`,
	                    '--dg-reveal-jx': `${((idx * 37) % 17) - 8}px`,
	                    '--dg-reveal-jy': `${((idx * 53) % 17) - 8}px`,
	                    '--dg-reveal-jr': `${((idx * 29) % 13) - 6}deg`,
	                    '--dg-reveal-js': `${1 + ((((idx * 17) % 9) - 4) * 0.018)}`,
	                  } as any}
	                  role="button"
	                  tabIndex={0}
	                  onClick={() => setActiveFolderId(folder.id)}
	                  onKeyDown={(e) => {
	                    if (e.key === 'Enter') setActiveFolderId(folder.id);
	                  }}
	                >
	                  <div className="dg-reveal-card__content">
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
	                          className="mac-btn mac-btn--icon"
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
	                          className="mac-btn mac-btn--icon"
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
	                            className="w-full mac-double-outline mac-interactive-row px-2 py-1 text-left text-xs flex items-center justify-between gap-2 group/file"
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
	                              <KindIcon kind={f.kind} size={12} />
	                              <span className="truncate">{f.name}</span>
	                            </button>
	                            <div className="flex items-center gap-1 opacity-0 group-hover/file:opacity-100 transition-opacity">
	                              <button
	                                type="button"
	                                className="mac-btn mac-btn--icon-sm"
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
	                                className="mac-btn mac-btn--icon-sm"
	                                title={!canEditFile(f, folder, userEmail) ? 'No edit access' : 'Delete'}
	                                disabled={!canEditFile(f, folder, userEmail)}
	                                onClick={(e) => {
	                                  e.preventDefault();
	                                  e.stopPropagation();
	                                  if (!canEditFile(f, folder, userEmail)) return;
	                                  setStore((prev) => {
	                                    const next = deleteLocalFile(prev, f.id);
	                                    return next;
	                                  });
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
                    <button type="button" className="mac-btn mac-btn--icon" title="Invite (copy + email)" onClick={inviteProject}>
                      <Mail size={14} />
                    </button>
                    <button
                      type="button"
                      className="mac-btn mac-btn--icon"
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
