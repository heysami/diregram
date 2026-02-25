'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useYjs } from '@/hooks/use-yjs';
import { useAuth } from '@/hooks/use-auth';
import { useYjsNexusTextPersistence } from '@/hooks/use-yjs-nexus-text-persistence';
import { useVisionDocStateFromYjs } from '@/hooks/use-vision-doc-state-from-yjs';
import { useVisionDocWriterToYjs } from '@/hooks/use-vision-doc-writer-to-yjs';
import { createLocalFile, createLocalFolder, ensureLocalFileStore, saveLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot, saveFileSnapshot } from '@/lib/local-doc-snapshots';
import { makeStarterVisionMarkdown } from '@/lib/vision-starter';
import { canEditFromAccess } from '@/lib/access-control';
import type { VisionDoc } from '@/lib/visionjson';
import { VisionEditor } from '@/components/vision/VisionEditor';
import { fetchProfileDefaultLayoutDirection } from '@/lib/layout-direction-supabase';
import type { LayoutDirection } from '@/lib/layout-direction';
import { listGlobalTemplates, loadGlobalTemplateContent } from '@/lib/global-templates';
import { persistMarkdownNow } from '@/lib/persist-markdown-now';

type ActiveFileMeta = {
  id: string;
  name: string;
  folderId: string | null;
  roomName: string;
  canEdit: boolean;
  initialContent?: string;
};

function nowIso() {
  return new Date().toISOString();
}

export function VisionEditorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const fileIdFromUrl = searchParams?.get('file') || '';

  const [activeFile, setActiveFile] = useState<ActiveFileMeta | null>(null);
  // Avoid connecting multiple unrelated files to a shared "demo" room.
  // Use a stable per-file placeholder room until we know the real room name.
  const activeRoomName = activeFile?.roomName || (fileIdFromUrl ? `file-${fileIdFromUrl}` : 'vision-demo');

  const { doc: yDoc, provider, status, connectedRoomName, synced } = useYjs(activeRoomName);

  const { contentReady } = useYjsNexusTextPersistence({
    doc: yDoc,
    provider,
    activeRoomName,
    connectedRoomName,
    synced,
    fileId: activeFile?.id || null,
    initialContent: activeFile?.initialContent,
    makeStarterMarkdown: makeStarterVisionMarkdown,
    loadSnapshot: loadFileSnapshot,
    saveSnapshot: saveFileSnapshot,
    persistRemote: supabaseMode
      ? (markdown) => {
          if (!supabase || !activeFile) return;
          supabase.from('files').update({ content: markdown, updated_at: nowIso() }).eq('id', activeFile.id).then(() => {});
        }
      : undefined,
  });

  const { visionDoc, setVisionDoc, rawMarkdownPreview, rawMarkdownChars } = useVisionDocStateFromYjs(yDoc);
  const { scheduleWriteVisionDoc, flushWriteVisionDoc } = useVisionDocWriterToYjs(yDoc);

  const [templateScope, setTemplateScope] = useState<'project' | 'account' | 'global'>('project');

  // Templates live either in:
  // - project scope: a hidden "Templates" folder under the active project's folder
  // - account scope: a root-level "Account Templates" folder
  const [templatesFolderId, setTemplatesFolderId] = useState<string | null>(null);
  const [templateFiles, setTemplateFiles] = useState<
    Array<{ id: string; name: string; kind: 'note' | 'diagram' | 'grid' | 'vision' | 'template' }>
  >([]);

  const ensureTemplatesFolderId = useCallback(async (scopeOverride?: 'project' | 'account'): Promise<string | null> => {
    const scope = scopeOverride || (templateScope === 'account' ? 'account' : 'project');
    const folderName = scope === 'account' ? 'Account Templates' : 'Templates';
    const parentId = scope === 'account' ? null : (activeFile?.folderId ?? null);
    if (!supabaseMode) {
      const store = ensureLocalFileStore();
      const existing = store.folders.find((f) => f.parentId === parentId && f.name === folderName) || null;
      if (existing) return existing.id;
      const next = createLocalFolder(store, folderName, parentId);
      const created = next.folders[next.folders.length - 1] || null;
      saveLocalFileStore(next);
      return created?.id || null;
    }
    if (!ready || !supabase) return null;
    const userId = user?.id || null;
    if (!userId) return null;
    let q = supabase.from('folders').select('id').eq('owner_id', userId).eq('name', folderName);
    q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);
    const { data: existing } = await q.maybeSingle();
    const existingId = (existing as { id?: string } | null)?.id;
    if (existingId) return String(existingId);
    const { data: created, error } = await supabase
      .from('folders')
      .insert({ name: folderName, owner_id: userId, parent_id: parentId })
      .select('id')
      .single();
    if (error) throw error;
    return String((created as { id: string }).id);
  }, [activeFile?.folderId, ready, supabase, supabaseMode, templateScope, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!activeFile) {
        setTemplatesFolderId(null);
        setTemplateFiles([]);
        return;
      }
      if (templateScope === 'global') {
        setTemplatesFolderId(null);
        if (!supabaseMode || !supabase) {
          setTemplateFiles([]);
          return;
        }
        try {
          const rows = await listGlobalTemplates(supabase);
          if (cancelled) return;
          setTemplateFiles(rows.map((r) => ({ id: r.id, name: r.name, kind: 'template' as const })));
        } catch {
          if (!cancelled) setTemplateFiles([]);
        }
        return;
      }
      try {
        const folderId = await ensureTemplatesFolderId();
        if (cancelled) return;
        setTemplatesFolderId(folderId);
        if (!folderId) {
          setTemplateFiles([]);
          return;
        }
        if (!supabaseMode) {
          const store = ensureLocalFileStore();
          const next = (store.files || [])
            .filter((f) => f.folderId === folderId)
            .map((f) => ({
              id: String(f.id),
              name: String(f.name || 'Untitled'),
              kind: (f.kind === 'note' || f.kind === 'grid' || f.kind === 'vision' || f.kind === 'diagram' || f.kind === 'template' ? f.kind : 'note') as
                | 'note'
                | 'diagram'
                | 'grid'
                | 'vision'
                | 'template',
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setTemplateFiles(next);
          return;
        }
        if (!ready || !supabase) return;
        const { data, error } = await supabase.from('files').select('id,name,kind').eq('folder_id', folderId).order('name');
        if (error) throw error;
        const next = (data || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((r: any) => ({
            id: String(r?.id || ''),
            name: String(r?.name || 'Untitled'),
            kind: (r?.kind === 'note' || r?.kind === 'grid' || r?.kind === 'vision' || r?.kind === 'diagram' || r?.kind === 'template' ? r.kind : 'note') as
              | 'note'
              | 'diagram'
              | 'grid'
              | 'vision'
              | 'template',
          }))
          .filter((f) => !!f.id);
        setTemplateFiles(next);
      } catch {
        setTemplatesFolderId(null);
        setTemplateFiles([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeFile, ensureTemplatesFolderId, ready, supabase, supabaseMode]);

  const loadTemplateMarkdown = useCallback(
    async (fileId: string): Promise<string> => {
      if (!supabaseMode) return loadFileSnapshot(fileId) || '';
      if (templateScope === 'global') {
        if (!supabase) return '';
        return await loadGlobalTemplateContent(supabase, fileId);
      }
      if (!supabase) return '';
      const { data, error } = await supabase.from('files').select('content').eq('id', fileId).single();
      if (error) throw error;
      return (data?.content as string) || '';
    },
    [supabase, supabaseMode, templateScope],
  );

  const saveTemplateFile = useCallback(
    async (res: { name: string; content: string; scope?: 'project' | 'account' }) => {
      const scope = res.scope === 'account' ? 'account' : 'project';
      const folderId = await ensureTemplatesFolderId(scope);
      if (!folderId) throw new Error('Templates folder not available.');
      if (!supabaseMode) {
        const store = ensureLocalFileStore();
        const created = createLocalFile(store, res.name, folderId, 'template');
        saveLocalFileStore(created.store);
        saveFileSnapshot(created.file.id, res.content);
        if (templateScope === scope) {
          setTemplateFiles((prev) =>
            [{ id: created.file.id, name: created.file.name, kind: 'template' as const }, ...prev].sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
        return;
      }
      if (!ready || !supabase) throw new Error('Not ready.');
      const userId = user?.id || null;
      if (!userId) throw new Error('Not signed in.');
      const defaultLayout: LayoutDirection = await fetchProfileDefaultLayoutDirection(supabase, userId);
      const roomName = `file-${crypto.randomUUID()}`;
      const { data, error } = await supabase
        .from('files')
        .insert({
          name: res.name,
          owner_id: userId,
          folder_id: folderId,
          room_name: roomName,
          last_opened_at: nowIso(),
          layout_direction: defaultLayout,
          kind: 'template',
          content: res.content,
        })
        .select('id,name,kind')
        .single();
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any = data;
      if (templateScope === scope) {
        setTemplateFiles((prev) =>
          [...prev, { id: String(row?.id || ''), name: String(row?.name || res.name), kind: 'template' as const }]
            .filter((f) => !!f.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    },
    [ensureTemplatesFolderId, fetchProfileDefaultLayoutDirection, ready, supabase, supabaseMode, templateScope, user?.id],
  );

  // Load file metadata based on ?file=...
  useEffect(() => {
    if (!fileIdFromUrl) {
      router.replace('/workspace');
      return;
    }

    let cancelled = false;

    // Local mode
    if (!supabaseMode) {
      const store = ensureLocalFileStore();
      const file = store.files.find((f) => f.id === fileIdFromUrl) || null;
      if (!file) {
        router.replace('/workspace');
        return;
      }
      const initialContent = loadFileSnapshot(file.id) || '';
      const next: ActiveFileMeta = {
        id: file.id,
        name: file.name,
        folderId: file.folderId,
        roomName: file.roomName,
        canEdit: true,
        initialContent,
      };
      setActiveFile((prev) => {
        if (
          prev &&
          prev.id === next.id &&
          prev.name === next.name &&
          prev.folderId === next.folderId &&
          prev.roomName === next.roomName &&
          prev.canEdit === next.canEdit &&
          (prev.initialContent || '') === (next.initialContent || '')
        ) {
          return prev;
        }
        return next;
      });
      return;
    }

    // Supabase mode
    (async () => {
      if (!ready) return;
      if (!supabase) return;
      try {
        const { data: fileRow, error: fileErr } = await supabase
          .from('files')
          .select('id,name,folder_id,room_name,content,access,owner_id')
          .eq('id', fileIdFromUrl)
          .single();
        if (fileErr || !fileRow) throw fileErr || new Error('File not found');

        const folderId = fileRow.folder_id as string | null;
        const { data: folderRow } = folderId
          ? await supabase.from('folders').select('id,owner_id,access').eq('id', folderId).maybeSingle()
          : { data: null as { access?: unknown } | null };

        const isOwner = user?.id && fileRow.owner_id === user.id;
        const canEdit =
          !!isOwner ||
          canEditFromAccess(fileRow.access, user?.email || null) ||
          canEditFromAccess(folderRow?.access, user?.email || null);

        if (!canEdit) {
          router.replace('/workspace');
          return;
        }

        const roomName = (fileRow.room_name as string | null) || `file-${fileRow.id}`;
        if (!fileRow.room_name) {
          // best-effort
          supabase.from('files').update({ room_name: roomName }).eq('id', fileRow.id).then(() => {});
        }
        supabase.from('files').update({ last_opened_at: nowIso() }).eq('id', fileRow.id).then(() => {});

        if (cancelled) return;
        const next: ActiveFileMeta = {
          id: fileRow.id,
          name: fileRow.name,
          folderId,
          roomName,
          canEdit: true,
          initialContent: (fileRow.content as string) || '',
        };
        setActiveFile((prev) => {
          if (
            prev &&
            prev.id === next.id &&
            prev.name === next.name &&
            prev.folderId === next.folderId &&
            prev.roomName === next.roomName &&
            prev.canEdit === next.canEdit &&
            (prev.initialContent || '') === (next.initialContent || '')
          ) {
            return prev;
          }
          return next;
        });
      } catch {
        router.replace('/workspace');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileIdFromUrl, supabaseMode, ready, supabase, user?.id, user?.email, router]);

  const handleVisionChange = useCallback(
    (next: VisionDoc) => {
      setVisionDoc(next);
      scheduleWriteVisionDoc(next);
    },
    [setVisionDoc, scheduleWriteVisionDoc],
  );

  const statusLabel = useMemo(() => {
    if (status === 'connected') return 'Online';
    if (status === 'connecting') return 'Connecting…';
    return 'Offline';
  }, [status]);

  const userId = user?.id || null;

  const roomReady = !!activeFile && !!yDoc && connectedRoomName === activeRoomName;
  if (!roomReady || !contentReady) return <div className="mac-desktop dg-screen-loading h-screen w-screen" aria-hidden="true" />;
  if (!visionDoc) return <div className="mac-desktop dg-screen-loading h-screen w-screen" aria-hidden="true" />;

  return (
    <VisionEditor
      fileId={activeFile.id}
      folderId={activeFile.folderId}
      title={activeFile.name}
      statusLabel={statusLabel}
      yDoc={yDoc}
      doc={visionDoc}
      onChange={handleVisionChange}
      onBack={() => {
        try {
          flushWriteVisionDoc();
          if (yDoc && activeFile) {
            const md = yDoc.getText('nexus').toString();
            saveFileSnapshot(activeFile.id, md);
            persistMarkdownNow({ supabaseMode, supabase: supabase || null, fileId: activeFile.id, markdown: md, updatedAtIso: nowIso() });
          }
        } catch {
          // ignore
        }
        router.push('/workspace');
      }}
      rawMarkdownPreview={rawMarkdownPreview}
      rawMarkdownChars={rawMarkdownChars}
      supabaseMode={supabaseMode}
      supabase={supabaseMode ? supabase : null}
      userId={supabaseMode ? userId : null}
      templateScope={templateScope}
      onTemplateScopeChange={setTemplateScope}
      templateFiles={templateFiles}
      loadTemplateMarkdown={loadTemplateMarkdown}
      onSaveTemplateFile={saveTemplateFile}
      templateSourceLabel={activeFile.name}
      globalTemplatesEnabled={supabaseMode && !!supabase && !!user?.id}
    />
  );
}
