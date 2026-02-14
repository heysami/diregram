'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useYjs } from '@/hooks/use-yjs';
import { useAuth } from '@/hooks/use-auth';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot, saveFileSnapshot } from '@/lib/local-doc-snapshots';
import { makeStarterNoteMarkdown } from '@/lib/note-starter';
import { NoteEditor } from '@/components/note/NoteEditor';
import { useYjsNexusTextPersistence } from '@/hooks/use-yjs-nexus-text-persistence';

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

export function NoteEditorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [activeFile, setActiveFile] = useState<ActiveFileMeta | null>(null);
  const activeRoomName = activeFile?.roomName || 'note-demo';

  const { doc: yDoc, provider, status, connectedRoomName, synced } = useYjs(activeRoomName);

  const [commentPanel, setCommentPanel] = useState<{
    targetKey: string | null;
    targetLabel?: string;
    scrollToThreadId?: string;
  }>({ targetKey: null });

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

  useYjsNexusTextPersistence({
    doc: yDoc,
    provider,
    activeRoomName,
    connectedRoomName,
    synced,
    fileId: activeFile?.id || null,
    initialContent: activeFile?.initialContent,
    makeStarterMarkdown: makeStarterNoteMarkdown,
    loadSnapshot: loadFileSnapshot,
    saveSnapshot: saveFileSnapshot,
    persistRemote: supabaseMode
      ? (markdown) => {
          if (!supabase || !activeFile) return;
          supabase.from('files').update({ content: markdown, updated_at: nowIso() }).eq('id', activeFile.id).then(() => {});
        }
      : undefined,
  });

  const statusLabel = useMemo(() => {
    if (status === 'connected') return 'Online';
    if (status === 'connecting') return 'Connecting…';
    return 'Offline';
  }, [status]);

  const setMarkdown = useCallback(
    (next: string) => {
      if (!yDoc) return;
      const yText = yDoc.getText('nexus');
      const cur = yText.toString();
      if (next === cur) return;
      yDoc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, next);
      });
    },
    [yDoc],
  );

  if (!yDoc || !activeFile) return <div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>;

  return (
    <NoteEditor
      yDoc={yDoc}
      provider={provider}
      title={activeFile.name}
      statusLabel={statusLabel}
      onBack={() => router.push('/workspace')}
      commentPanel={commentPanel}
      onCommentPanelChange={setCommentPanel}
    />
  );
}

