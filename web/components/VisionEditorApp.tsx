'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useYjs } from '@/hooks/use-yjs';
import { useAuth } from '@/hooks/use-auth';
import { useYjsNexusTextPersistence } from '@/hooks/use-yjs-nexus-text-persistence';
import { useVisionDocStateFromYjs } from '@/hooks/use-vision-doc-state-from-yjs';
import { useVisionDocWriterToYjs } from '@/hooks/use-vision-doc-writer-to-yjs';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot, saveFileSnapshot } from '@/lib/local-doc-snapshots';
import { makeStarterVisionMarkdown } from '@/lib/vision-starter';
import { canEditFromAccess } from '@/lib/access-control';
import type { VisionDoc } from '@/lib/visionjson';
import { VisionEditor } from '@/components/vision/VisionEditor';

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

  const { visionDoc, setVisionDoc, rawMarkdownPreview, rawMarkdownChars } = useVisionDocStateFromYjs(yDoc);
  const { scheduleWriteVisionDoc } = useVisionDocWriterToYjs(yDoc);

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

  useYjsNexusTextPersistence({
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

  if (!yDoc || !activeFile) return <div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>;
  if (!visionDoc) return <div className="flex h-screen items-center justify-center text-xs opacity-80">Loading vision…</div>;

  return (
    <VisionEditor
      fileId={activeFile.id}
      folderId={activeFile.folderId}
      title={activeFile.name}
      statusLabel={statusLabel}
      yDoc={yDoc}
      doc={visionDoc}
      onChange={handleVisionChange}
      onBack={() => router.push('/workspace')}
      rawMarkdownPreview={rawMarkdownPreview}
      rawMarkdownChars={rawMarkdownChars}
      supabaseMode={supabaseMode}
      supabase={supabaseMode ? supabase : null}
      userId={supabaseMode ? userId : null}
    />
  );
}

