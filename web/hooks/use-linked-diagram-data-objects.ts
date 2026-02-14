'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type * as Y from 'yjs';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';
import { loadDataObjects, upsertDataObject, type NexusDataObject, type NexusDataObjectStore } from '@/lib/data-object-storage';
import { useOptionalYjs } from '@/hooks/use-optional-yjs';
import type { GridDoc } from '@/lib/gridjson';

export type DiagramFileOption = {
  id: string;
  name: string;
  roomName: string;
  kind: string;
  canEdit: boolean;
};

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

function firstLinkedDiagramFileIdFromGridDoc(gridDoc: GridDoc | null): string | null {
  if (!gridDoc) return null;
  for (const s of gridDoc.sheets || []) {
    for (const t of s.grid.tables || []) {
      const link = t.dataObjectLink;
      if (link?.diagramFileId) return link.diagramFileId;
    }
  }
  return null;
}

export function useLinkedDiagramDataObjects(opts: {
  activeGridFileId: string | null;
  activeFolderId: string | null;
  gridDoc: GridDoc | null;
  supabaseMode: boolean;
  ready: boolean;
  supabase: SupabaseClient | null;
  user: { id: string | null; email: string | null } | null;
}) {
  const { activeGridFileId, activeFolderId, gridDoc, supabaseMode, ready, supabase, user } = opts;

  const [diagramFiles, setDiagramFiles] = useState<DiagramFileOption[]>([]);
  const [linkedDiagramFileId, setLinkedDiagramFileId] = useState<string | null>(null);

  const linkedDiagramFile = useMemo(() => {
    if (!linkedDiagramFileId) return null;
    return diagramFiles.find((f) => f.id === linkedDiagramFileId) || null;
  }, [diagramFiles, linkedDiagramFileId]);

  const linkedDiagramRoomName = useMemo(() => {
    if (linkedDiagramFile) return linkedDiagramFile.roomName;
    if (linkedDiagramFileId) return `file-${linkedDiagramFileId}`;
    return null;
  }, [linkedDiagramFile, linkedDiagramFileId]);

  const { doc: linkedDiagramDoc, provider: linkedDiagramProvider, status: linkedDiagramStatus } = useOptionalYjs(linkedDiagramRoomName);
  const [linkedDataObjectStore, setLinkedDataObjectStore] = useState<NexusDataObjectStore | null>(null);

  // Load candidate diagram files in the same folder as this grid file.
  useEffect(() => {
    if (!activeGridFileId) return;
    if (!activeFolderId) {
      setDiagramFiles([]);
      return;
    }

    let cancelled = false;

    // Local mode
    if (!supabaseMode) {
      const store = ensureLocalFileStore();
      const files = store.files
        .filter((f) => (f.folderId || null) === activeFolderId)
        .filter((f) => f.id !== activeGridFileId)
        .filter((f) => (f.kind || 'diagram') !== 'grid')
        .map(
          (f): DiagramFileOption => ({
            id: f.id,
            name: f.name,
            roomName: f.roomName || `file-${f.id}`,
            kind: String(f.kind || 'diagram'),
            canEdit: true,
          }),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!cancelled) setDiagramFiles(files);
      return () => {
        cancelled = true;
      };
    }

    // Supabase mode
    (async () => {
      if (!ready) return;
      if (!supabase) return;
      if (!user?.id) return;
      try {
        const { data: rows, error } = await supabase
          .from('files')
          .select('id,name,room_name,kind,access,owner_id')
          .eq('folder_id', activeFolderId);
        if (error) throw error;
        const out: DiagramFileOption[] = (rows || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((r: any) => String(r?.id || '') && String(r?.id || '') !== activeGridFileId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((r: any) => String(r?.kind || 'diagram') !== 'grid')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((r: any) => {
            const id = String(r.id);
            const name = String(r.name || id);
            const roomName = String(r.room_name || `file-${id}`);
            const kind = String(r.kind || 'diagram');
            const ownerId = String(r.owner_id || '');
            const canEdit = ownerId === user.id || canEditFromAccess(r.access, user.email || null);
            return { id, name, roomName, kind, canEdit };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setDiagramFiles(out);
      } catch {
        if (!cancelled) setDiagramFiles([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeGridFileId, activeFolderId, supabaseMode, ready, supabase, user?.id, user?.email]);

  // Auto-select a linked diagram file when the grid contains linked tables.
  useEffect(() => {
    const linked = firstLinkedDiagramFileIdFromGridDoc(gridDoc);
    if (!linked) return;
    setLinkedDiagramFileId((prev) => prev || linked);
  }, [gridDoc]);

  // Keep a live view of the linked diagram's data objects store.
  useEffect(() => {
    if (!linkedDiagramDoc) {
      setLinkedDataObjectStore(null);
      return;
    }
    const update = () => setLinkedDataObjectStore(loadDataObjects(linkedDiagramDoc));
    update();
    const yText = linkedDiagramDoc.getText('nexus');
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [linkedDiagramDoc]);

  // Seed linked diagram doc content from snapshots/DB when empty.
  useEffect(() => {
    if (!linkedDiagramDoc) return;
    if (!linkedDiagramFileId) return;

    let cancelled = false;
    const yText = linkedDiagramDoc.getText('nexus');

    const seedIfEmpty = async () => {
      const current = yText.toString();
      if (current.trim().length > 0) return;

      // Local mode: use local snapshot.
      if (!supabaseMode) {
        const snap = loadFileSnapshot(linkedDiagramFileId) || '';
        if (!snap.trim()) return;
        if (cancelled) return;
        linkedDiagramDoc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, snap);
        });
        return;
      }

      // Supabase mode: load file content snapshot.
      if (!ready) return;
      if (!supabase) return;
      try {
        const { data: row, error } = await supabase.from('files').select('content').eq('id', linkedDiagramFileId).single();
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const snap = String((row as any)?.content || '');
        if (!snap.trim()) return;
        if (cancelled) return;
        const cur2 = yText.toString();
        if (cur2.trim().length > 0) return;
        linkedDiagramDoc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, snap);
        });
      } catch {
        // ignore
      }
    };

    // Best-effort immediate seed.
    void seedIfEmpty();

    // Also seed once the provider reports synced (when available).
    const providerEvents = linkedDiagramProvider as unknown as {
      on?: (event: string, cb: () => void) => void;
      off?: (event: string, cb: () => void) => void;
    };
    const onSynced = () => {
      void seedIfEmpty();
    };
    providerEvents.on?.('synced', onSynced);

    return () => {
      cancelled = true;
      providerEvents.off?.('synced', onSynced);
    };
  }, [linkedDiagramDoc, linkedDiagramProvider, linkedDiagramFileId, supabaseMode, ready, supabase]);

  const canEditLinkedDiagramFile = Boolean(linkedDiagramFile?.canEdit);
  const upsertLinkedDataObject = useCallback(
    (obj: NexusDataObject) => {
      if (!linkedDiagramDoc) return;
      if (!canEditLinkedDiagramFile) return;
      upsertDataObject(linkedDiagramDoc, obj);
    },
    [linkedDiagramDoc, canEditLinkedDiagramFile],
  );

  const linkedDiagramStatusLabel = useMemo(() => {
    if (!linkedDiagramFileId) return null;
    if (linkedDiagramStatus === 'connected') return 'Online';
    if (linkedDiagramStatus === 'connecting') return 'Connecting…';
    return 'Offline';
  }, [linkedDiagramFileId, linkedDiagramStatus]);

  return {
    diagramFiles,
    linkedDiagramFileId,
    setLinkedDiagramFileId,
    linkedDiagramStatusLabel,
    linkedDiagramDoc: linkedDiagramDoc as Y.Doc | null,
    linkedDataObjectStore,
    canEditLinkedDiagramFile,
    upsertLinkedDataObject,
  };
}

