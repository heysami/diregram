'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';
import { useOptionalYjs } from '@/hooks/use-optional-yjs';

export type RemoteNexusFileMeta = {
  id: string;
  name: string;
  kind: string;
  roomName: string;
  /** Snapshot content from DB (supabase mode only when fetched). */
  content?: string;
};

export function useRemoteNexusDoc(opts: {
  fileId: string | null;
  supabaseMode: boolean;
  ready: boolean;
  supabase: SupabaseClient | null;
}) {
  const { fileId, supabaseMode, ready, supabase } = opts;
  const [meta, setMeta] = useState<RemoteNexusFileMeta | null>(null);

  useEffect(() => {
    if (!fileId) {
      setMeta(null);
      return;
    }

    let cancelled = false;

    // Local mode
    if (!supabaseMode) {
      const store = ensureLocalFileStore();
      const f = store.files.find((x) => x.id === fileId) || null;
      const m: RemoteNexusFileMeta = {
        id: fileId,
        name: f?.name || fileId,
        kind: String(f?.kind || 'diagram'),
        roomName: String(f?.roomName || `file-${fileId}`),
      };
      if (!cancelled) setMeta(m);
      return () => {
        cancelled = true;
      };
    }

    // Supabase mode
    (async () => {
      if (!ready) return;
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('files')
          .select('id,name,kind,room_name,content')
          .eq('id', fileId)
          .single();
        if (error) throw error;
        const any = data as unknown as { id?: string; name?: string; kind?: string; room_name?: string | null; content?: string | null };
        const id = String(any?.id || fileId);
        const m: RemoteNexusFileMeta = {
          id,
          name: String(any?.name || id),
          kind: String(any?.kind || 'diagram'),
          roomName: String(any?.room_name || `file-${id}`),
          content: String(any?.content || ''),
        };
        if (!cancelled) setMeta(m);
      } catch {
        if (!cancelled) setMeta({ id: fileId, name: fileId, kind: 'diagram', roomName: `file-${fileId}` });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, supabaseMode, ready, supabase]);

  const roomName = useMemo(() => (meta?.roomName ? meta.roomName : fileId ? `file-${fileId}` : null), [meta?.roomName, fileId]);
  const { doc, provider, status } = useOptionalYjs(roomName);

  // Seed remote doc when empty (best-effort, mirrors use-linked-diagram-data-objects).
  useEffect(() => {
    if (!doc) return;
    if (!fileId) return;
    let cancelled = false;
    const yText = doc.getText('nexus');

    const seedIfEmpty = async () => {
      const cur = yText.toString();
      if (cur.trim().length > 0) return;

      // Local mode: use local snapshot.
      if (!supabaseMode) {
        const snap = loadFileSnapshot(fileId) || '';
        if (!snap.trim()) return;
        if (cancelled) return;
        doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, snap);
        });
        return;
      }

      // Supabase mode: prefer already-fetched content; else fetch on-demand.
      const snapFromMeta = String(meta?.content || '');
      if (snapFromMeta.trim().length) {
        if (cancelled) return;
        const cur2 = yText.toString();
        if (cur2.trim().length > 0) return;
        doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, snapFromMeta);
        });
        return;
      }

      if (!ready) return;
      if (!supabase) return;
      try {
        const { data, error } = await supabase.from('files').select('content').eq('id', fileId).single();
        if (error) throw error;
        const snap = String((data as any)?.content || '');
        if (!snap.trim()) return;
        if (cancelled) return;
        const cur3 = yText.toString();
        if (cur3.trim().length > 0) return;
        doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, snap);
        });
      } catch {
        // ignore
      }
    };

    void seedIfEmpty();

    const providerEvents = provider as unknown as {
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
  }, [doc, provider, fileId, supabaseMode, ready, supabase, meta?.content]);

  return { meta, roomName, doc, status };
}

