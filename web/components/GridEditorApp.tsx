'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useYjs } from '@/hooks/use-yjs';
import { useAuth } from '@/hooks/use-auth';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot, saveFileSnapshot } from '@/lib/local-doc-snapshots';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';
import { loadGridDoc, saveGridDoc, type GridDoc } from '@/lib/gridjson';
import { GridEditor } from '@/components/grid/GridEditor';
import { useLinkedDiagramDataObjects } from '@/hooks/use-linked-diagram-data-objects';

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

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function canEditFromAccess(access: unknown, userEmail: string | null) {
  if (!access || typeof access !== 'object') return false;
  const people = (access as { people?: unknown }).people;
  if (!Array.isArray(people) || people.length === 0) return false;
  if (!userEmail) return false;
  const e = normalizeEmail(userEmail);
  return people.some((p) => {
    if (!p || typeof p !== 'object') return false;
    const rec = p as { email?: unknown; role?: unknown };
    const email = typeof rec.email === 'string' ? normalizeEmail(rec.email) : '';
    const role = typeof rec.role === 'string' ? rec.role : 'view';
    return !!email && email === e && role === 'edit';
  });
}

function stripLegacyTableJson(markdown: string): string {
  return markdown.replace(/```tablejson\n[\s\S]*?\n```/g, '').trimEnd() + '\n';
}

export function GridEditorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [activeFile, setActiveFile] = useState<ActiveFileMeta | null>(null);
  const activeRoomName = activeFile?.roomName || 'grid-demo';

  const { doc: yDoc, provider, status, undo, redo, canUndo, canRedo } = useYjs(activeRoomName);

  const [gridDoc, setGridDoc] = useState<GridDoc | null>(null);
  const [rawMarkdown, setRawMarkdown] = useState<string>('');
  const loadedSourceRef = useRef<'gridjson' | 'legacyTableJson' | 'default'>('default');

  const {
    diagramFiles,
    linkedDiagramFileId,
    setLinkedDiagramFileId,
    linkedDiagramStatusLabel,
    linkedDataObjectStore,
    canEditLinkedDiagramFile,
    upsertLinkedDataObject,
  } = useLinkedDiagramDataObjects({
    activeGridFileId: activeFile?.id || null,
    activeFolderId: activeFile?.folderId || null,
    gridDoc,
    supabaseMode,
    ready,
    supabase: supabase || null,
    user: user ? { id: user.id || null, email: user.email || null } : null,
  });

  // Load file metadata based on ?file=...
  useEffect(() => {
    const fileIdFromUrl = searchParams?.get('file');
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
      setActiveFile({
        id: file.id,
        name: file.name,
        folderId: file.folderId,
        roomName: file.roomName,
        canEdit: true,
        initialContent,
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
        setActiveFile({
          id: fileRow.id,
          name: fileRow.name,
          folderId,
          roomName,
          canEdit: true,
          initialContent: (fileRow.content as string) || '',
        });
      } catch {
        router.replace('/workspace');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, supabaseMode, ready, supabase, user?.id, user?.email, router]);

  // Persistence + initial restore (same idea as the diagram editor)
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!yDoc || !provider || !activeFile) return;
    const fileId = activeFile.id;
    const yText = yDoc.getText('nexus');

    const seedIfEmpty = () => {
      const current = yText.toString();
      if (current.trim().length > 0) return;
      const snap = activeFile.initialContent || loadFileSnapshot(fileId) || makeStarterGridMarkdown();
      if (!snap || snap.trim().length === 0) return;
      yDoc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, snap);
      });
    };

    const onSynced = () => {
      seedIfEmpty();
    };
    const providerEvents = provider as unknown as {
      on?: (event: string, cb: () => void) => void;
      off?: (event: string, cb: () => void) => void;
    };
    providerEvents.on?.('synced', onSynced);

    // Best-effort immediate seed (for local mode / already-synced cases)
    seedIfEmpty();

    const onTextChange = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        const next = yText.toString();
        saveFileSnapshot(fileId, next);
        if (supabaseMode) {
          supabase
            ?.from('files')
            .update({ content: next, updated_at: nowIso() })
            .eq('id', fileId)
            .then(() => {});
        }
      }, 250);
    };

    onTextChange();
    yText.observe(onTextChange);

    return () => {
      yText.unobserve(onTextChange);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      providerEvents.off?.('synced', onSynced);
    };
  }, [yDoc, provider, activeFile?.id, supabaseMode, supabase]);

  // Live-load gridjson on doc text changes (collab / undo)
  useEffect(() => {
    if (!yDoc) return;
    const yText = yDoc.getText('nexus');
    const update = () => {
      const md = yText.toString();
      const loaded = loadGridDoc(md);
      loadedSourceRef.current = loaded.source;
      setGridDoc(loaded.doc);
      setRawMarkdown(md);
    };
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [yDoc]);

  const gridWriteTimerRef = useRef<number | null>(null);
  const writeGridToDoc = useCallback(
    (nextDoc: GridDoc) => {
      if (!yDoc) return;
      const yText = yDoc.getText('nexus');
      const current = yText.toString();
      // If this was a legacy tablejson doc, strip the legacy block on first write.
      const base = loadedSourceRef.current === 'legacyTableJson' ? stripLegacyTableJson(current) : current;
      const next = saveGridDoc(base, nextDoc);
      if (next === current) return;
      yDoc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, next);
      });
      loadedSourceRef.current = 'gridjson';
    },
    [yDoc],
  );

  const handleGridChange = useCallback(
    (next: GridDoc) => {
      setGridDoc(next);
      if (gridWriteTimerRef.current) window.clearTimeout(gridWriteTimerRef.current);
      gridWriteTimerRef.current = window.setTimeout(() => {
        gridWriteTimerRef.current = null;
        writeGridToDoc(next);
      }, 120);
    },
    [writeGridToDoc],
  );

  useEffect(() => {
    return () => {
      if (gridWriteTimerRef.current) window.clearTimeout(gridWriteTimerRef.current);
      gridWriteTimerRef.current = null;
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (status === 'connected') return 'Online';
    if (status === 'connecting') return 'Connecting…';
    return 'Offline';
  }, [status]);

  if (!yDoc || !activeFile) return <div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>;
  if (!gridDoc) return <div className="flex h-screen items-center justify-center text-xs opacity-80">Loading grid…</div>;

  return (
    <GridEditor
      doc={gridDoc}
      yDoc={yDoc}
      onChange={handleGridChange}
      statusLabel={statusLabel}
      diagramFiles={diagramFiles}
      linkedDiagramFileId={linkedDiagramFileId}
      onLinkedDiagramFileIdChange={setLinkedDiagramFileId}
      linkedDiagramStatusLabel={linkedDiagramStatusLabel || undefined}
      linkedDataObjectStore={linkedDataObjectStore}
      canEditLinkedDiagramFile={canEditLinkedDiagramFile}
      upsertLinkedDataObject={upsertLinkedDataObject}
      title={activeFile.name}
      onBack={() => router.push('/workspace')}
      onUndo={undo}
      onRedo={redo}
      canUndo={canUndo}
      canRedo={canRedo}
      rawMarkdown={rawMarkdown}
    />
  );
}

