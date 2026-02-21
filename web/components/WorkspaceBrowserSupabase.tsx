'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Copy, Download, FileText, Folder, FolderPlus, Mail, Pencil, Plus, Trash2, Network, Eye, Table, LayoutTemplate, FlaskConical, Package, Share2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AccessPeopleEditor } from '@/components/AccessPeopleEditor';
import type { AccessPerson } from '@/lib/local-file-store';
import type { LayoutDirection } from '@/lib/layout-direction';
import { fetchProfileDefaultLayoutDirection } from '@/lib/layout-direction-supabase';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';
import { makeStarterNoteMarkdown } from '@/lib/note-starter';
import { makeStarterVisionMarkdown } from '@/lib/vision-starter';
import { makeStarterTestMarkdown } from '@/lib/test-starter';
import type { DocKind } from '@/lib/doc-kinds';
import { NewFromTemplateModal } from '@/components/templates/NewFromTemplateModal';
import { listGlobalTemplates, loadGlobalTemplateContent } from '@/lib/global-templates';
import { installGlobalTemplateToLibrary } from '@/lib/install-global-template';
import { TemplateMoveControls } from '@/components/templates/TemplateMoveControls';
import { ensureTemplateLibraryFolderId, moveTemplateFileToFolder, type TemplateLibraryScope } from '@/lib/template-library';
import { downloadProjectBundleZip, exportProjectBundleZip } from '@/lib/export-bundle';
import { exportKgAndVectorsForProject } from '@/lib/kg-vector-export';
import { ProjectActionMenus } from '@/components/workspace/ProjectActionMenus';
import { SemanticKgViewerModal } from '@/components/kg/SemanticKgViewerModal';
import { DoclingImportPanel } from '@/components/docling/DoclingImportPanel';
import { ImportMermaidModal } from '@/components/mermaid/ImportMermaidModal';
import { MarkdownDocModal } from '@/components/grid/MarkdownDocModal';
import { downloadTextFile } from '@/lib/client-download';

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
  kind?: string | null;
};

type DbProjectResource = {
  id: string;
  name: string;
  owner_id: string;
  project_folder_id: string;
  kind: string | null;
  created_at: string;
  updated_at: string | null;
};

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
  const searchParams = useSearchParams();
  const { configured, supabase, ready, user } = useAuth();
  const userId = user?.id || null;
  const userEmail = user?.email || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<DbFolder[]>([]);
  const [files, setFiles] = useState<DbFile[]>([]);
  const [ragReady, setRagReady] = useState<boolean | null>(null);

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<EditProjectState | null>(null);
  const [editFile, setEditFile] = useState<EditFileState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [newFromTemplateOpen, setNewFromTemplateOpen] = useState(false);
  const [importMermaidOpen, setImportMermaidOpen] = useState(false);
  const [projectTab, setProjectTab] = useState<'files' | 'templates' | 'import'>('files');
  const [templateScope, setTemplateScope] = useState<'project' | 'account' | 'global'>('project');
  const [templatesFolderId, setTemplatesFolderId] = useState<string | null>(null);
  const [templateFiles, setTemplateFiles] = useState<DbFile[]>([]);
  const [globalTemplateFiles, setGlobalTemplateFiles] = useState<Array<{ id: string; name: string; kind: 'template' }>>([]);
  const [kgViewerOpen, setKgViewerOpen] = useState(false);
  const [kgExportResult, setKgExportResult] = useState<Awaited<ReturnType<typeof exportKgAndVectorsForProject>> | null>(null);

  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [resources, setResources] = useState<DbProjectResource[]>([]);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceModal, setResourceModal] = useState<{ id: string; name: string; markdown: string } | null>(null);

  const loadOpenAiKey = () => {
    try {
      return String(window.localStorage.getItem('diregram.openaiApiKey.v1') || '');
    } catch {
      return '';
    }
  };

  const ensureOpenAiKey = async (): Promise<string> => {
    const existing = loadOpenAiKey().trim();
    if (existing) return existing;
    const entered = String(window.prompt('Enter your OpenAI API key (starts with sk-). This will be saved in this browser only.', '') || '').trim();
    if (!entered) return '';
    try {
      window.localStorage.setItem('diregram.openaiApiKey.v1', entered);
    } catch {
      // ignore
    }
    return entered;
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 1600);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied');
    } catch {
      showToast('Copy failed');
    }
  };

  const reloadResources = async () => {
    if (!supabase) return;
    if (!activeFolderId) return;
    setResourcesError(null);
    setResourcesLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_resources')
        .select('id,name,owner_id,project_folder_id,kind,created_at,updated_at')
        .eq('project_folder_id', activeFolderId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setResources((data || []) as any);
    } catch (e) {
      setResources([]);
      setResourcesError(e instanceof Error ? e.message : 'Failed to load resources');
    } finally {
      setResourcesLoading(false);
    }
  };

  const loadResourceMarkdown = async (resourceId: string): Promise<{ name: string; markdown: string } | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('project_resources').select('name,markdown').eq('id', resourceId).single();
    if (error) throw error;
    return { name: String((data as any)?.name || 'Resource'), markdown: String((data as any)?.markdown || '') };
  };

  useEffect(() => {
    if (!supabase) return;
    if (!activeFolderId) return;
    if (projectTab !== 'import') return;
    reloadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, activeFolderId, projectTab]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, []);

  // Project header dropdowns are encapsulated in `ProjectActionMenus`.

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
        .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,kind')
        .in('folder_id', folderIds);
      if (fileErr) throw fileErr;
      setFiles((fileRows || []) as DbFile[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load workspace';
      setError(msg);
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

  // Keep the active project in the URL so humans can share/open it.
  useEffect(() => {
    const fromUrl = String(searchParams?.get('project') || '').trim();
    if (fromUrl && !activeFolderId) {
      // Only auto-open if it exists in the loaded list.
      if (folders.some((f) => f.id === fromUrl)) setActiveFolderId(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, searchParams]);

  useEffect(() => {
    const cur = String(searchParams?.get('project') || '').trim();
    const next = activeFolderId ? String(activeFolderId) : '';
    if (next === cur) return;
    if (next) router.replace(`/workspace?project=${encodeURIComponent(next)}`);
    else router.replace('/workspace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const activeFolder = useMemo(() => (activeFolderId ? folderById.get(activeFolderId) || null : null), [activeFolderId, folderById]);
  const isAccountTemplatesProject = activeFolder?.name === 'Account Templates';

  // Detect whether this project has a built RAG KB (presence of rag_projects row).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setRagReady(null);
      if (!supabase) return;
      if (!activeFolder) return;
      const { data, error } = await supabase
        .from('rag_projects')
        .select('public_id')
        .eq('owner_id', activeFolder.owner_id)
        .eq('project_folder_id', activeFolder.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setRagReady(false);
        return;
      }
      setRagReady(Boolean(data?.public_id));
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [supabase, activeFolder?.id, activeFolder?.owner_id]);

  // If user opens the special "Account Templates" folder, force it into template-library mode
  // so account templates don't show up under the normal Files tab.
  useEffect(() => {
    if (!isAccountTemplatesProject) return;
    setProjectTab('templates');
    setTemplateScope('account');
  }, [isAccountTemplatesProject]);

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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setTemplatesFolderId(null);
      setTemplateFiles([]);
      setGlobalTemplateFiles([]);
      if (!supabase) return;
      if (!userId) return;
      if (projectTab !== 'templates' && !newFromTemplateOpen) return;
      if (templateScope === 'project' && !activeFolder) return;

      if (templateScope === 'global') {
        try {
          const rows = await listGlobalTemplates(supabase);
          if (cancelled) return;
          setGlobalTemplateFiles(rows.map((r) => ({ id: r.id, name: r.name, kind: 'template' as const })));
        } catch {
          if (!cancelled) setGlobalTemplateFiles([]);
        }
        return;
      }

      const inheritedAccess = templateScope === 'project' ? ((activeFolder as any)?.access ?? null) : null;
      const folderId = await ensureTemplateLibraryFolderId(supabase, {
        userId,
        scope: templateScope as TemplateLibraryScope,
        projectFolderId: templateScope === 'project' ? activeFolder!.id : null,
        inheritedAccess,
      });

      if (cancelled) return;
      setTemplatesFolderId(folderId);

      const { data: rows, error } = await supabase
        .from('files')
        .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,kind')
        .eq('folder_id', folderId);
      if (cancelled) return;
      if (error) throw error;
      setTemplateFiles((rows || []) as DbFile[]);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeFolder, newFromTemplateOpen, projectTab, supabase, templateScope, userId]);

  const openFile = async (file: DbFile) => {
    if (!supabase) return;
    try {
      await supabase.from('files').update({ last_opened_at: nowIso() }).eq('id', file.id);
    } catch {
      // ignore
    }
    router.push(`/editor?file=${encodeURIComponent(file.id)}`);
  };

  const editFileRow = useMemo(() => {
    if (!editFile) return null;
    return files.find((f) => f.id === editFile.id) || null;
  }, [editFile, files]);

  const editFileRowFromTemplates = useMemo(() => {
    if (!editFile) return null;
    return templateFiles.find((f) => f.id === editFile.id) || null;
  }, [editFile, templateFiles]);

  const editDbFile = useMemo(() => editFileRowFromTemplates || editFileRow || null, [editFileRowFromTemplates, editFileRow]);
  const editingIsTemplate = editDbFile?.kind === 'template';

  const ensureTemplatesFolderIdFor = async (scope: TemplateLibraryScope): Promise<string> => {
    if (!supabase || !userId) throw new Error('Not ready.');
    const inheritedAccess = scope === 'project' ? ((activeFolder as any)?.access ?? null) : null;
    return await ensureTemplateLibraryFolderId(supabase, {
      userId,
      scope,
      projectFolderId: activeFolder?.id ?? null,
      inheritedAccess,
    });
  };

  const [templateMoveScope, setTemplateMoveScope] = useState<TemplateLibraryScope>('project');

  const loadFileMarkdown = async (fileId: string): Promise<string> => {
    if (!supabase) return '';
    if (templateScope === 'global') {
      return await loadGlobalTemplateContent(supabase, fileId);
    }
    const { data, error } = await supabase.from('files').select('content').eq('id', fileId).single();
    if (error) throw error;
    return (data?.content as string) || '';
  };

  const createFromTemplate = async (folderId: string, res: { name: string; kind: DocKind; content: string }) => {
    if (!supabase || !userId) return;
    const defaultLayout: LayoutDirection = await fetchProfileDefaultLayoutDirection(supabase, userId);
    const roomName = `file-${crypto.randomUUID()}`;
    const { data, error: err } = await supabase
      .from('files')
      .insert({
        name: res.name,
        owner_id: userId,
        folder_id: folderId,
        room_name: roomName,
        last_opened_at: nowIso(),
        layout_direction: defaultLayout,
        kind: res.kind,
        content: res.content,
      })
      .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,layout_direction,kind')
      .single();
    if (err) throw err;
    const file = data as unknown as DbFile;
    setFiles((prev) => [file, ...prev]);
    await openFile(file);
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
    const { data, error: delErr } = await supabase.from('folders').delete().eq('id', folderId).select('id');
    if (delErr) return showToast(delErr.message);
    const deletedCount = Array.isArray(data) ? data.length : data ? 1 : 0;
    if (deletedCount <= 0) {
      showToast('Could not delete (insufficient permission).');
      return;
    }
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
        kind: 'diagram',
      })
      .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,layout_direction,kind')
      .single();
    if (err) return showToast(err.message);
    const file = data as unknown as DbFile;
    setFiles((prev) => [file, ...prev]);
    openFile(file);
  };

  const createDiagramFileWithContent = async (
    folderId: string,
    res: { name: string; content: string; layoutDirection?: LayoutDirection },
  ) => {
    if (!supabase || !userId) return;
    const defaultLayout: LayoutDirection = await fetchProfileDefaultLayoutDirection(supabase, userId);
    const layout_direction = res.layoutDirection || defaultLayout;
    const roomName = `file-${crypto.randomUUID()}`;
    const { data, error: err } = await supabase
      .from('files')
      .insert({
        name: res.name,
        owner_id: userId,
        folder_id: folderId,
        room_name: roomName,
        last_opened_at: nowIso(),
        layout_direction,
        kind: 'diagram',
        content: res.content,
      })
      .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,layout_direction,kind')
      .single();
    if (err) throw err;
    const file = data as unknown as DbFile;
    setFiles((prev) => [file, ...prev]);
    await openFile(file);
  };

  const createGridFile = async (folderId: string) => {
    if (!supabase || !userId) return;
    const defaultLayout: LayoutDirection = await fetchProfileDefaultLayoutDirection(supabase, userId);
    const roomName = `file-${crypto.randomUUID()}`;
    const initialContent = makeStarterGridMarkdown();
    const { data, error: err } = await supabase
      .from('files')
      .insert({
        name: 'New Grid',
        owner_id: userId,
        folder_id: folderId,
        room_name: roomName,
        last_opened_at: nowIso(),
        layout_direction: defaultLayout,
        kind: 'grid',
        content: initialContent,
      })
      .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,layout_direction,kind')
      .single();
    if (err) return showToast(err.message);
    const file = data as unknown as DbFile;
    setFiles((prev) => [file, ...prev]);
    openFile(file);
  };

  const createNoteFile = async (folderId: string) => {
    if (!supabase || !userId) return;
    const defaultLayout: LayoutDirection = await fetchProfileDefaultLayoutDirection(supabase, userId);
    const roomName = `file-${crypto.randomUUID()}`;
    const initialContent = makeStarterNoteMarkdown();
    const { data, error: err } = await supabase
      .from('files')
      .insert({
        name: 'New Note',
        owner_id: userId,
        folder_id: folderId,
        room_name: roomName,
        last_opened_at: nowIso(),
        layout_direction: defaultLayout,
        kind: 'note',
        content: initialContent,
      })
      .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,layout_direction,kind')
      .single();
    if (err) return showToast(err.message);
    const file = data as unknown as DbFile;
    setFiles((prev) => [file, ...prev]);
    openFile(file);
  };

  const createVisionFile = async (folderId: string) => {
    if (!supabase || !userId) return;
    const defaultLayout: LayoutDirection = await fetchProfileDefaultLayoutDirection(supabase, userId);
    const roomName = `file-${crypto.randomUUID()}`;
    const initialContent = makeStarterVisionMarkdown();
    const { data, error: err } = await supabase
      .from('files')
      .insert({
        name: 'New Vision',
        owner_id: userId,
        folder_id: folderId,
        room_name: roomName,
        last_opened_at: nowIso(),
        layout_direction: defaultLayout,
        kind: 'vision',
        content: initialContent,
      })
      .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,layout_direction,kind')
      .single();
    if (err) return showToast(err.message);
    const file = data as unknown as DbFile;
    setFiles((prev) => [file, ...prev]);
    openFile(file);
  };

  const createTestFile = async (folderId: string) => {
    if (!supabase || !userId) return;
    const defaultLayout: LayoutDirection = await fetchProfileDefaultLayoutDirection(supabase, userId);
    const roomName = `file-${crypto.randomUUID()}`;
    const initialContent = makeStarterTestMarkdown();
    const { data, error: err } = await supabase
      .from('files')
      .insert({
        name: 'New Test',
        owner_id: userId,
        folder_id: folderId,
        room_name: roomName,
        last_opened_at: nowIso(),
        layout_direction: defaultLayout,
        kind: 'test',
        content: initialContent,
      })
      .select('id,name,owner_id,folder_id,room_name,last_opened_at,updated_at,access,layout_direction,kind')
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
    // Templates inherit access from their containing folder (project or account library).
    // Do not allow per-template access overrides here.
    const patch: any = editingIsTemplate ? { name } : { name, access: editFile.people.length ? { people: editFile.people } : null };
    const { error: err } = await supabase.from('files').update(patch).eq('id', editFile.id);
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
                  onClick={() => {
                    setActiveFolderId(folder.id);
                  }}
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
                        disabled={folder.name === 'Account Templates' || !empty || !canEdit}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canEdit) return;
                          if (folder.name === 'Account Templates') return;
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
                            <KindIcon kind={f.kind} size={12} />
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
                                  .select('id')
                                  .then(({ data, error: delErr }) => {
                                    if (delErr) return showToast(delErr.message);
                                    const deletedCount = Array.isArray(data) ? data.length : data ? 1 : 0;
                                    if (deletedCount <= 0) {
                                      showToast('Could not delete (insufficient permission).');
                                      return;
                                    }
                                    setFiles((prev) => prev.filter((x) => x.id !== f.id));
                                    setTemplateFiles((prev) => prev.filter((x) => x.id !== f.id));
                                    showToast('Deleted');
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
            {isAccountTemplatesProject ? (
              <div className="flex items-center gap-1 rounded border bg-white p-0.5">
                <button type="button" className="mac-btn h-8 mac-btn--primary" disabled title="Account templates library">
                  Templates
                </button>
              </div>
            ) : (
              <>
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
                  <button
                    type="button"
                    className={`mac-btn h-8 ${projectTab === 'import' ? 'mac-btn--primary' : ''}`}
                    onClick={() => setProjectTab('import')}
                    title="Additional resources (import / convert)"
                  >
                    Additional resources
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
                    <option value="global">Global</option>
                  </select>
                ) : null}
              </>
            )}

              <ProjectActionMenus
                projectTab={projectTab}
                canEdit={effectiveCanEditFolder(activeFolder, userId, userEmail)}
                onNewMap={() => createFile(activeFolder.id)}
                onNewFromTemplate={() => setNewFromTemplateOpen(true)}
                onImportMermaidDiagram={() => setImportMermaidOpen(true)}
                onNewGrid={() => createGridFile(activeFolder.id)}
                onNewNote={() => createNoteFile(activeFolder.id)}
                onNewVision={() => createVisionFile(activeFolder.id)}
                onNewTest={() => createTestFile(activeFolder.id)}
                onBuildKnowledgeBase={async () => {
                  if (!supabase) return;
                  try {
                    const openaiApiKey = await ensureOpenAiKey();
                    if (!openaiApiKey) {
                      showToast('Missing OpenAI key (set it in Account)');
                      return;
                    }
                    showToast('Building knowledge base…');
                    const res = await fetch('/api/rag/ingest', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json', 'x-openai-api-key': openaiApiKey },
                      body: JSON.stringify({ projectFolderId: activeFolder.id }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      const msg = (json as any)?.error ? String((json as any).error) : 'Build failed';
                      showToast(msg);
                      return;
                    }
                    const stats = (json as any)?.stats;
                    if (stats?.chunks != null) showToast(`KB built (${stats.chunks} chunks)`);
                    else showToast('KB built');
                    setRagReady(true);
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : 'Build failed');
                  }
                }}
                ragStatus={ragReady == null ? 'loading' : ragReady ? 'ready' : 'not_built'}
                onCopyMcpAccountUrl={async () => {
                  try {
                    showToast('Creating MCP account link…');
                    const res = await fetch('/api/rag/mcp-account', { method: 'POST' });
                    const raw = await res.text().catch(() => '');
                    const json = (() => {
                      try {
                        return raw ? JSON.parse(raw) : {};
                      } catch {
                        return {};
                      }
                    })();
                    if (!res.ok) {
                      const msg =
                        (json as any)?.error
                          ? String((json as any).error)
                          : raw.trim()
                            ? raw.trim().slice(0, 400)
                            : `Failed (HTTP ${res.status})`;
                      showToast(msg);
                      return;
                    }
                    const url = String((json as any)?.mcpUrl || '').trim();
                    const token = String((json as any)?.token || '').trim();
                    if (url) {
                      await copyText(url);
                      return;
                    }
                    if (token) {
                      await copyText(token);
                      showToast('Copied token (set MCP server URL in env)');
                      return;
                    }
                    showToast('Created, but nothing to copy');
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : 'Failed');
                  }
                }}
                onCopyProjectLink={async () => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : '';
                  if (!origin) return;
                  await copyText(`${origin}/workspace?project=${encodeURIComponent(activeFolder.id)}`);
                }}
                onExportBundle={async () => {
                  if (!supabase) return;
                  const includeKgVectors = confirm('Include KG + embeddings outputs in the bundle?');
                  const out = await exportProjectBundleZip({
                    supabaseMode: true,
                    supabase,
                    projectFolderId: activeFolder.id,
                    includeKgVectors,
                  });
                  downloadProjectBundleZip(out);
                  showToast('Exported');
                }}
                onExportKg={async () => {
                  if (!supabase) return;
                  const res = await exportKgAndVectorsForProject({
                    supabaseMode: true,
                    supabase,
                    projectFolderId: activeFolder.id,
                  });
                  setKgExportResult(res);
                  setKgViewerOpen(true);
                  showToast('Exported');
                }}
                onEditProject={() => setEditProject({ id: activeFolder.id, name: activeFolder.name, people: activeFolder.access?.people || [] })}
              />
            </div>
          </div>

          <NewFromTemplateModal
            open={newFromTemplateOpen}
            title="New from template"
            files={(templateScope === 'global'
              ? globalTemplateFiles
              : templateFiles.filter((f) => effectiveCanView(f, activeFolder, userId, userEmail))
            ).map((f: any) => ({ id: String(f.id), name: String(f.name || 'Untitled'), kind: normalizeKind((f as any).kind) }))}
            loadMarkdown={loadFileMarkdown}
            scope={{
              value: templateScope,
              options: [
                { id: 'project', label: 'This project' },
                { id: 'account', label: 'Account' },
                { id: 'global', label: 'Global' },
              ],
              onChange: (next) => setTemplateScope(next as any),
            }}
            onClose={() => setNewFromTemplateOpen(false)}
            onCreate={async ({ name, kind, content }) => {
              const k = normalizeKind(kind);
              await createFromTemplate(activeFolder.id, { name, kind: k, content });
            }}
          />

          <ImportMermaidModal
            open={importMermaidOpen}
            onClose={() => setImportMermaidOpen(false)}
            onCreate={async ({ name, content, mermaidType }) => {
              await createDiagramFileWithContent(activeFolder.id, {
                name,
                content,
                layoutDirection: mermaidType === 'journey' ? 'horizontal' : undefined,
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
            {(() => {
              if (projectTab === 'import') {
                return (
                  <div className="space-y-4">
                    <DoclingImportPanel
                      supabase={supabase}
                      userId={userId}
                      projectFolderId={activeFolder.id}
                      onSavedResource={() => {
                        reloadResources();
                        showToast('Saved to additional resources');
                      }}
                    />

                    <div className="mac-window mac-double-outline p-5 space-y-3 max-w-[760px]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-bold tracking-tight">Additional resources</div>
                          <div className="text-xs opacity-70">Markdown saved to this project (used as reference material).</div>
                        </div>
                        <button type="button" className="mac-btn h-8" onClick={reloadResources} disabled={resourcesLoading} title="Refresh">
                          Refresh
                        </button>
                      </div>

                      {resourcesError ? <div className="text-xs mac-double-outline p-3">Error: {resourcesError}</div> : null}
                      {resourcesLoading ? <div className="text-xs opacity-70">Loading…</div> : null}

                      {!resourcesLoading && resources.length === 0 ? <div className="text-xs opacity-70">No resources yet.</div> : null}

                      <div className="grid gap-2">
                        {resources.map((r) => (
                          <div key={r.id} className="mac-double-outline p-3 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              className="text-left min-w-0 flex-1"
                              title="Open"
                              onClick={async () => {
                                try {
                                  const res = await loadResourceMarkdown(r.id);
                                  if (!res) return;
                                  setResourceModal({ id: r.id, name: res.name, markdown: res.markdown });
                                  setResourceModalOpen(true);
                                } catch (e) {
                                  showToast(e instanceof Error ? e.message : 'Failed to open');
                                }
                              }}
                            >
                              <div className="text-xs font-semibold truncate">{r.name || 'Resource'}</div>
                              <div className="text-[11px] opacity-70 mt-1">
                                {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                              </div>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                className="mac-btn h-8"
                                title="Download .md"
                                onClick={async () => {
                                  try {
                                    const res = await loadResourceMarkdown(r.id);
                                    if (!res) return;
                                    downloadTextFile(res.name || 'resource.md', res.markdown);
                                  } catch (e) {
                                    showToast(e instanceof Error ? e.message : 'Download failed');
                                  }
                                }}
                              >
                                <Download size={14} />
                              </button>
                              <button
                                type="button"
                                className="mac-btn h-8"
                                title="Delete"
                                onClick={async () => {
                                  if (!supabase) return;
                                  if (!confirm('Delete this resource?')) return;
                                  try {
                                    const { error } = await supabase.from('project_resources').delete().eq('id', r.id);
                                    if (error) throw error;
                                    setResources((prev) => prev.filter((x) => x.id !== r.id));
                                    showToast('Deleted');
                                  } catch (e) {
                                    showToast(e instanceof Error ? e.message : 'Delete failed');
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              if (projectTab === 'templates' && templateScope === 'global') {
                const visible = globalTemplateFiles;
                if (visible.length === 0) {
                  return <div className="mac-double-outline p-4 text-xs opacity-80">No global templates yet.</div>;
                }
                return visible.map((f) => (
                  <div key={f.id} className="mac-double-outline p-3 text-left flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="flex items-center gap-2 min-w-0 flex-1 opacity-80 cursor-default"
                      onClick={() => router.push(`/templates/global/${encodeURIComponent(f.id)}`)}
                      title="Open preview"
                    >
                      <KindIcon kind={f.kind} size={14} />
                      <div className="text-xs font-semibold truncate">{f.name}</div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="mac-btn h-8 flex items-center gap-1.5"
                        title="Install into Account Templates"
                        onClick={async () => {
                          if (!supabase || !userId) return;
                          try {
                            const content = await loadGlobalTemplateContent(supabase, f.id);
                            const installed = await installGlobalTemplateToLibrary(supabase, {
                              userId,
                              content,
                              fallbackName: f.name,
                              scope: 'account',
                            });
                            showToast('Installed to Account Templates');
                            router.push(`/editor?file=${encodeURIComponent(installed.fileId)}`);
                          } catch (e) {
                            const msg = (e as any)?.message ? String((e as any).message) : 'Install failed.';
                            showToast(msg);
                          }
                        }}
                      >
                        <Download size={14} />
                        Install
                      </button>
                      <button
                        type="button"
                        className="mac-btn h-8"
                        title="Install into this project’s Templates folder"
                        disabled={!effectiveCanEditFolder(activeFolder, userId, userEmail)}
                        onClick={async () => {
                          if (!supabase || !userId) return;
                          if (!effectiveCanEditFolder(activeFolder, userId, userEmail)) return;
                          try {
                            const content = await loadGlobalTemplateContent(supabase, f.id);
                            const installed = await installGlobalTemplateToLibrary(supabase, {
                              userId,
                              content,
                              fallbackName: f.name,
                              scope: 'project',
                              projectFolderId: activeFolder.id,
                            });
                            showToast('Installed to project Templates');
                            router.push(`/editor?file=${encodeURIComponent(installed.fileId)}`);
                          } catch (e) {
                            const msg = (e as any)?.message ? String((e as any).message) : 'Install failed.';
                            showToast(msg);
                          }
                        }}
                      >
                        To project
                      </button>
                    </div>
                  </div>
                ));
              }

              const shown = isAccountTemplatesProject ? templateFiles : projectTab === 'templates' ? templateFiles : (filesByFolder.get(activeFolder.id) || []);
              const visible = shown.filter((f) => effectiveCanView(f, activeFolder, userId, userEmail));
              if (visible.length === 0) {
                return (
                  <div className="mac-double-outline p-4 text-xs opacity-80">
                    {projectTab === 'templates' ? 'No templates yet.' : 'No maps yet.'}
                  </div>
                );
              }
              return visible.map((f) => (
                <div key={f.id} className="mac-double-outline p-3 text-left hover:bg-gray-50 flex items-center justify-between gap-3 group">
                  <button type="button" className="flex items-center gap-2 min-w-0 flex-1" onClick={() => openFile(f)} title="Open">
                    <KindIcon kind={f.kind} size={14} />
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
                              .select('id')
                              .then(({ data, error: delErr }) => {
                                if (delErr) return showToast(delErr.message);
                                const deletedCount = Array.isArray(data) ? data.length : data ? 1 : 0;
                                if (deletedCount <= 0) {
                                  showToast('Could not delete (insufficient permission).');
                                  return;
                                }
                                setFiles((prev) => prev.filter((x) => x.id !== f.id));
                                setTemplateFiles((prev) => prev.filter((x) => x.id !== f.id));
                                showToast('Deleted');
                              });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      <MarkdownDocModal
        isOpen={resourceModalOpen}
        title={resourceModal?.name || 'Resource'}
        views={[{ id: 'markdown', label: 'Markdown', text: resourceModal?.markdown || '' }]}
        initialViewId="markdown"
        onClose={() => {
          setResourceModalOpen(false);
          setResourceModal(null);
        }}
      />

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
              <div className="mac-title">{editingIsTemplate ? 'Edit template' : 'Edit map'}</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold">Name</div>
                <input className="mac-field w-full" value={editFile.name} onChange={(e) => setEditFile((p) => (p ? { ...p, name: e.target.value } : p))} />
              </div>

              {editingIsTemplate ? (
                <TemplateMoveControls
                  value={templateMoveScope}
                  onChange={setTemplateMoveScope}
                  disabled={!supabase || !userId || (templateMoveScope === 'project' && !activeFolder)}
                  onMove={async () => {
                    if (!supabase || !userId) return;
                    if (!editFile) return;
                    if (templateMoveScope === 'project' && !activeFolder) return;
                    try {
                      const targetFolderId = await ensureTemplatesFolderIdFor(templateMoveScope);
                      await moveTemplateFileToFolder(supabase, { fileId: editFile.id, targetFolderId });
                      showToast('Moved');
                      setEditFile(null);
                      await reload();
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : 'Move failed');
                    }
                  }}
                />
              ) : (
                <AccessPeopleEditor
                  label="Access"
                  value={editFile.people}
                  onChange={(next) => setEditFile((p) => (p ? { ...p, people: next } : p))}
                  error={editError}
                  onError={setEditError}
                />
              )}

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

