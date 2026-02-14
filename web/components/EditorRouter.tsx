'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import type { DocKind } from '@/lib/doc-kinds';
import { EditorApp as DiagramEditorApp } from '@/components/EditorApp';
import { GridEditorApp } from '@/components/GridEditorApp';

function normalizeKind(raw: unknown): DocKind {
  return raw === 'note' || raw === 'grid' || raw === 'vision' || raw === 'diagram' ? raw : 'diagram';
}

export function EditorRouter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const fileId = searchParams?.get('file') || '';

  const [kind, setKind] = useState<DocKind | null>(null);

  const canLoad = useMemo(() => {
    if (!fileId) return false;
    if (supabaseMode) return ready && !!supabase;
    return true;
  }, [fileId, supabaseMode, ready, supabase]);

  useEffect(() => {
    if (!fileId) {
      router.replace('/workspace');
      return;
    }
    if (!canLoad) return;

    let cancelled = false;

    // Local mode: read from local store metadata.
    if (!supabaseMode) {
      const store = ensureLocalFileStore();
      const file = store.files.find((f) => f.id === fileId) || null;
      if (!file) {
        router.replace('/workspace');
        return;
      }
      const nextKind = normalizeKind(file.kind);
      if (!cancelled) setKind(nextKind);
      return;
    }

    // Supabase mode: read minimal kind from DB (RLS enforces access).
    (async () => {
      try {
        const { data, error } = await supabase!.from('files').select('kind').eq('id', fileId).single();
        if (error) throw error;
        const nextKind = normalizeKind((data as { kind?: string | null } | null)?.kind);
        if (!cancelled) setKind(nextKind);
      } catch {
        if (!cancelled) router.replace('/workspace');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, canLoad, supabaseMode, supabase, router]);

  if (!fileId) return null;
  if (!kind) return <div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>;

  if (kind === 'grid') return <GridEditorApp />;
  return <DiagramEditorApp />;
}

