'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import type { DocKind } from '@/lib/doc-kinds';
import { EditorApp as DiagramEditorApp } from '@/components/EditorApp';
import { GridEditorApp } from '@/components/GridEditorApp';
import { NoteEditorApp } from '@/components/NoteEditorApp';
import { VisionEditorApp } from '@/components/VisionEditorApp';
import { TemplateEditorApp } from '@/components/TemplateEditorApp';
import { TestEditorApp } from '@/components/TestEditorApp';

function normalizeKind(raw: unknown): DocKind {
  return raw === 'note' || raw === 'grid' || raw === 'vision' || raw === 'diagram' || raw === 'template' || raw === 'test' ? raw : 'diagram';
}

export function EditorRouter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const fileId = searchParams?.get('file') || '';

  const [kindState, setKindState] = useState<{ fileId: string; kind: DocKind } | null>(null);

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
      if (!cancelled) setKindState({ fileId, kind: nextKind });
      return;
    }

    // Supabase mode: read minimal kind from DB (RLS enforces access).
    (async () => {
      try {
        const { data, error } = await supabase!.from('files').select('kind').eq('id', fileId).single();
        if (error) throw error;
        const nextKind = normalizeKind((data as { kind?: string | null } | null)?.kind);
        if (!cancelled) setKindState({ fileId, kind: nextKind });
      } catch {
        if (!cancelled) router.replace('/workspace');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, canLoad, supabaseMode, supabase, router]);

  if (!fileId) return null;
  if (!kindState || kindState.fileId !== fileId) return <div className="mac-desktop dg-screen-loading h-screen w-screen" aria-hidden="true" />;

  const kind = kindState.kind;
  if (kind === 'grid') return <GridEditorApp key={`grid:${fileId}`} />;
  if (kind === 'note') return <NoteEditorApp key={`note:${fileId}`} />;
  if (kind === 'vision') return <VisionEditorApp key={`vision:${fileId}`} />;
  if (kind === 'template') return <TemplateEditorApp key={`template:${fileId}`} />;
  if (kind === 'test') return <TestEditorApp key={`test:${fileId}`} />;
  return <DiagramEditorApp key={`diagram:${fileId}`} />;
}
