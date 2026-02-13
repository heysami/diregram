'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, FileText, Folder, FolderPlus, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AccessPeopleEditor } from '@/components/AccessPeopleEditor';
import type { AccessPerson } from '@/lib/local-file-store';
import type { LayoutDirection } from '@/lib/layout-direction';
import { fetchProfileDefaultLayoutDirection } from '@/lib/layout-direction-supabase';

type DbFolder = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  access: { people?: AccessPerson[] } | null;
};

type DbFile = {
  id: string;
  name: string;
  owner_id: string;
  folder_id: string | null;
  room_name: string | null;
  last_opened_at: string | null;
  updated_at: string | null;
  access: { people?: AccessPerson[] } | null;
  layout_direction?: LayoutDirection | null;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function canViewFromAccess(access: { people?: AccessPerson[] } | null, userEmail: string | null) {
  const people = access?.people || [];
  if (people.length === 0) return false;
  if (!userEmail) return false;
  const e = normalizeEmail(userEmail);
  return people.some((p) => normalizeEmail(p.email) === e);
}

function canEditFromAccess(access: { people?: AccessPerson[] } | null, userEmail: string | null) {
  const people = access?.people || [];
  if (people.length === 0) return false;
  if (!userEmail) return false;
  const e = normalizeEmail(userEmail);
  return people.some((p) => normalizeEmail(p.email) === e && p.role === 'edit');
}

function effectiveCanView(file: DbFile, folder: DbFolder | null, userId: string, userEmail: string | null) {
  if (file.owner_id === userId) return true;
  if (canViewFromAccess(file.access, userEmail) || canEditFromAccess(file.access, userEmail)) return true;
  if (!folder) return false;
  if (folder.owner_id === userId) return true;
  return canViewFromAccess(folder.access, userEmail) || canEditFromAccess(folder.access, userEmail);
}

function effectiveCanEditFile(file: DbFile, folder: DbFolder | null, userId: string, userEmail: string | null) {
  if (file.owner_id === userId) return true;
  if (canEditFromAccess(file.access, userEmail)) return true;
  if (!folder) return false;
  if (folder.owner_id === userId) return true;
  return canEditFromAccess(folder.access, userEmail);
}

function effectiveCanEditFolder(folder: DbFolder, userId: string, userEmail: string | null) {
  if (folder.owner_id === userId) return true;
  return canEditFromAccess(folder.access, userEmail);
}

type EditProjectState = { id: string; name: string; people: AccessPerson[] };
type EditFileState = { id: string; name: string; people: AccessPerson[] };

export function WorkspaceBrowserSupabase() {
  const router = useRouter();
  const { configured, supabase, ready, user } = useAuth();
  const userId = user?.id || null;
  const userEmail = user?.email || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<DbFolder[]>([]);
  const [files, setFiles] = useState<DbFile[]>([]);

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<EditProjectState | null>(null);
  const [editFile, setEditFile] = useState<EditFileState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 1600);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, []);

  const reload = async () => {
    if (!configured || !supabase || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: folderRows, error: folderErr } = await supabase
        .from('folders')
        .select('id,name,owner_id,created_at,access,parent_id')
        .is('parent_id', null)
        .order('created_at', { ascending: false });
      if (folderErr) throw folderErr;
      const fds = (folderRows || []) as DbFolder[];
      setFolders(fds);

      const folderIds = fds.map((f) => f.id);
      if (folderIds.length === 0) {
        setFiles([]);
        return;
      }

      const { data: fileRows, error: fileErr } = await supabase
        .from('files')
        .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access')
        .in('folder_id', folderIds);
      if (fileErr) throw fileErr;
      setFiles((fileRows || []) as DbFile[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!configured) return;
    if (!ready) return;
    if (!supabase) return;
    if (!userId) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, ready, supabase, userId]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const activeFolder = useMemo(() => (activeFolderId ? folderById.get(activeFolderId) || null : null), [activeFolderId, folderById]);

  const filesByFolder = useMemo(() => {
    const map = new Map<string, DbFile[]>();
    files.forEach((f) => {
      const fid = f.folder_id;
      if (!fid) return;
      map.set(fid, [...(map.get(fid) || []), f]);
    });
    map.forEach((arr, k) => {
      arr.sort((a, b) => {
        const at = a.last_opened_at || a.updated_at || '';
        const bt = b.last_opened_at || b.updated_at || '';
        return bt.localeCompare(at);
      });
      map.set(k, arr);
    });
    return map;
  }, [files]);

  const openFile = async (file: DbFile) => {
    if (!supabase) return;
    try {
      await supabase.from('files').update({ last_opened_at: nowIso() }).eq('id', file.id);
    } catch {
      // ignore
    }
    router.push(`/editor?file=${encodeURIComponent(file.id)}`);
  };

  const createProject = async () => {
    if (!supabase || !userId) return;
    const { data, error: err } = await supabase
      .from('folders')
      .insert({ name: 'New Project', owner_id: userId, parent_id: null })
      .select('id,name,owner_id,created_at,access')
      .single();
    if (err) return showToast(err.message);
    setFolders((prev) => [data as unknown as DbFolder, ...prev]);
    showToast('Project created');
  };

  const deleteProject = async (folderId: string) => {
    if (!supabase) return;
    const { count, error: cntErr } = await supabase.from('files').select('id', { count: 'exact', head: true }).eq('folder_id', folderId);
    if (cntErr) return showToast(cntErr.message);
    if ((count || 0) > 0) return;
    const { error: delErr } = await supabase.from('folders').delete().eq('id', folderId);
    if (delErr) return showToast(delErr.message);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setFiles((prev) => prev.filter((f) => f.folder_id !== folderId));
    showToast('Deleted');
  };

  const createFile = async (folderId: string) => {
    if (!supabase || !userId) return;
    // Respect per-account default when creating new files.
    const defaultLayout: LayoutDirection = await fetchProfileDefaultLayoutDirection(supabase, userId);
    const roomName = `file-${crypto.randomUUID()}`;
    const { data, error: err } = await supabase
      .from('files')
      .insert({
        name: 'New Map',
        owner_id: userId,
        folder_id: folderId,
        room_name: roomName,
        last_opened_at: nowIso(),
        layout_direction: defaultLayout,
      })
      .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,layout_direction')
      .single();
    if (err) return showToast(err.message);
    const file = data as unknown as DbFile;
    setFiles((prev) => [file, ...prev]);
    openFile(file);
  };

  const saveProject = async () => {
    if (!editProject || !supabase) return;
    setEditError(null);
    const name = editProject.name.trim();
    if (!name) return setEditError('Project name is required.');
    const access = editProject.people.length ? { people: editProject.people } : null;
    const { error: err } = await supabase.from('folders').update({ name, access }).eq('id', editProject.id);
    if (err) return setEditError(err.message);
    setEditProject(null);
    await reload();
    showToast('Saved');
  };

  const saveFile = async () => {
    if (!editFile || !supabase) return;
    setEditError(null);
    const name = editFile.name.trim();
    if (!name) return setEditError('File name is required.');
    const access = editFile.people.length ? { people: editFile.people } : null;
    const { error: err } = await supabase.from('files').update({ name, access }).eq('id', editFile.id);
    if (err) return setEditError(err.message);
    setEditFile(null);
    await reload();
    showToast('Saved');
  };

  const invitePeople = async (label: string, people: AccessPerson[]) => {
    if (people.length === 0) return showToast('Add someone first');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const lines = people.map((p) => `- ${p.email} (${p.role})`).join('\n');
    const body = `You’ve been granted access in Diregram: ${label}\n\nAccess:\n${lines}\n\nOpen Diregram: ${origin}\n`;
    const subject = `Diregram access`;
    const to = people.map((p) => p.email).join(',');
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      showToast('Invite copied');
    } catch {
      // ignore
    }
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  if (!configured) return null;
  if (!ready) return <div className="text-xs opacity-80">Loading…</div>;
  if (!supabase) return <div className="text-xs opacity-80">Loading…</div>;
  if (!userId) return <div className="text-xs">You’re signed out.</div>;

  return (
    <div className="w-full">
      {toast ? (
        <div className="fixed left-1/2 top-[54px] z-50 -translate-x-1/2 mac-double-outline bg-white px-3 py-1 text-xs">
          {toast}
        </div>
      ) : null}

      {error ? <div className="mac-double-outline p-3 text-xs">{error}</div> : null}

      {loading ? <div className="text-xs opacity-80">Loading…</div> : null}

      {!activeFolder ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold tracking-tight">Projects</div>
            <button type="button" className="mac-btn flex items-center gap-1.5" onClick={createProject}>
              <FolderPlus size={14} />
              New project
            </button>
          </div>

          <div className="grid gap-4 w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((folder) => {
              const canEdit = effectiveCanEditFolder(folder, userId, userEmail);
              const recent = (filesByFolder.get(folder.id) || [])
                .filter((f) => effectiveCanView(f, folder, userId, userEmail))
                .slice(0, 3);
              const empty = (filesByFolder.get(folder.id) || []).length === 0;

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
                        title={!canEdit ? 'No edit access' : 'Edit'}
                        disabled={!canEdit}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canEdit) return;
                          setEditError(null);
                          setEditProject({ id: folder.id, name: folder.name, people: folder.access?.people || [] });
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="h-7 w-7 border flex items-center justify-center bg-white"
                        title={empty ? 'Delete' : 'Delete (project not empty)'}
                        disabled={!empty || !canEdit}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canEdit) return;
                          deleteProject(folder.id);
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
                              openFile(f);
                            }}
                          >
                            <FileText size={12} />
                            <span className="truncate">{f.name}</span>
                          </button>

                          <div className="flex items-center gap-1 opacity-0 group-hover/file:opacity-100 transition-opacity">
                            <button
                              type="button"
                              className="h-6 w-6 border flex items-center justify-center bg-white"
                              title={!effectiveCanEditFile(f, folder, userId, userEmail) ? 'No edit access' : 'Edit'}
                              disabled={!effectiveCanEditFile(f, folder, userId, userEmail)}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!effectiveCanEditFile(f, folder, userId, userEmail)) return;
                                setEditError(null);
                                setEditFile({ id: f.id, name: f.name, people: f.access?.people || [] });
                              }}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              className="h-6 w-6 border flex items-center justify-center bg-white"
                              title={!effectiveCanEditFile(f, folder, userId, userEmail) ? 'No edit access' : 'Delete'}
                              disabled={!effectiveCanEditFile(f, folder, userId, userEmail)}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!effectiveCanEditFile(f, folder, userId, userEmail)) return;
                                supabase
                                  .from('files')
                                  .delete()
                                  .eq('id', f.id)
                                  .then(({ error: delErr }) => {
                                    if (delErr) showToast(delErr.message);
                                    else {
                                      setFiles((prev) => prev.filter((x) => x.id !== f.id));
                                      showToast('Deleted');
                                    }
                                  });
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
      ) : (
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
                disabled={!effectiveCanEditFolder(activeFolder, userId, userEmail)}
                onClick={() => createFile(activeFolder.id)}
                title={!effectiveCanEditFolder(activeFolder, userId, userEmail) ? 'No edit access' : 'New map'}
              >
                <Plus size={14} />
                New map
              </button>
              <button
                type="button"
                className="mac-btn flex items-center gap-1.5"
                disabled={!effectiveCanEditFolder(activeFolder, userId, userEmail)}
                title={!effectiveCanEditFolder(activeFolder, userId, userEmail) ? 'No edit access' : 'Edit project'}
                onClick={() => setEditProject({ id: activeFolder.id, name: activeFolder.name, people: activeFolder.access?.people || [] })}
              >
                <Pencil size={14} />
                Edit
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            {(filesByFolder.get(activeFolder.id) || [])
              .filter((f) => effectiveCanView(f, activeFolder, userId, userEmail))
              .map((f) => (
                <div key={f.id} className="mac-double-outline p-3 text-left hover:bg-gray-50 flex items-center justify-between gap-3 group">
                  <button type="button" className="flex items-center gap-2 min-w-0 flex-1" onClick={() => openFile(f)} title="Open">
                    <FileText size={14} />
                    <div className="text-xs font-semibold truncate">{f.name}</div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-[11px] opacity-70 hidden sm:block">{(f.last_opened_at || f.updated_at) ? new Date(f.last_opened_at || f.updated_at || '').toLocaleDateString() : ''}</div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <>
                        <button
                          type="button"
                          className="h-7 w-7 border flex items-center justify-center bg-white"
                          title={!effectiveCanEditFile(f, activeFolder, userId, userEmail) ? 'No edit access' : 'Edit'}
                          disabled={!effectiveCanEditFile(f, activeFolder, userId, userEmail)}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!effectiveCanEditFile(f, activeFolder, userId, userEmail)) return;
                            setEditError(null);
                            setEditFile({ id: f.id, name: f.name, people: f.access?.people || [] });
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="h-7 w-7 border flex items-center justify-center bg-white"
                          title={!effectiveCanEditFile(f, activeFolder, userId, userEmail) ? 'No edit access' : 'Delete'}
                          disabled={!effectiveCanEditFile(f, activeFolder, userId, userEmail)}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!effectiveCanEditFile(f, activeFolder, userId, userEmail)) return;
                            supabase
                              .from('files')
                              .delete()
                              .eq('id', f.id)
                              .then(({ error: delErr }) => {
                                if (delErr) showToast(delErr.message);
                                else {
                                  setFiles((prev) => prev.filter((x) => x.id !== f.id));
                                  showToast('Deleted');
                                }
                              });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {editProject ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button type="button" className="absolute inset-0 bg-white/60" aria-label="Close" onClick={() => setEditProject(null)} />
          <div className="relative mac-window mac-double-outline w-[720px] max-w-[96vw] overflow-hidden">
            <div className="mac-titlebar">
              <div className="mac-title">Edit project</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold">Name</div>
                <input className="mac-field w-full" value={editProject.name} onChange={(e) => setEditProject((p) => (p ? { ...p, name: e.target.value } : p))} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">Access</div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="h-7 w-7 border flex items-center justify-center" title="Invite (copy + email)" onClick={() => invitePeople(editProject.name, editProject.people)}>
                      <Mail size={14} />
                    </button>
                    <button
                      type="button"
                      className="h-7 w-7 border flex items-center justify-center"
                      title="Copy list"
                      onClick={async () => {
                        if (editProject.people.length === 0) return showToast('Add someone first');
                        const text = editProject.people.map((p) => `${p.email} (${p.role})`).join('\n');
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

                <AccessPeopleEditor label="People" value={editProject.people} onChange={(next) => setEditProject((p) => (p ? { ...p, people: next } : p))} error={editError} onError={setEditError} />
              </div>

              {editError ? <div className="text-xs">{editError}</div> : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" className="mac-btn" onClick={() => setEditProject(null)}>
                  Cancel
                </button>
                <button type="button" className="mac-btn mac-btn--primary" onClick={saveProject}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button type="button" className="absolute inset-0 bg-white/60" aria-label="Close" onClick={() => setEditFile(null)} />
          <div className="relative mac-window mac-double-outline w-[560px] max-w-[96vw] overflow-hidden">
            <div className="mac-titlebar">
              <div className="mac-title">Edit map</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold">Name</div>
                <input className="mac-field w-full" value={editFile.name} onChange={(e) => setEditFile((p) => (p ? { ...p, name: e.target.value } : p))} />
              </div>

              <AccessPeopleEditor label="Access" value={editFile.people} onChange={(next) => setEditFile((p) => (p ? { ...p, people: next } : p))} error={editError} onError={setEditError} />

              {editError ? <div className="text-xs">{editError}</div> : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" className="mac-btn" onClick={() => setEditFile(null)}>
                  Cancel
                </button>
                <button type="button" className="mac-btn mac-btn--primary" onClick={saveFile}>
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

