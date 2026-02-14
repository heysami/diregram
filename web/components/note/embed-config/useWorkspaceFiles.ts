'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import type { DocKind } from '@/lib/doc-kinds';

export type WorkspaceFile = { id: string; name: string; kind: DocKind };

export function useWorkspaceFiles(opts?: { kinds?: DocKind[] }) {
  const kinds = opts?.kinds || null;
  const kindsKey = useMemo(() => (kinds ? kinds.slice().sort().join(',') : ''), [kinds]);
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        if (!supabaseMode) {
          const store = ensureLocalFileStore();
          const next: WorkspaceFile[] = (store.files || [])
            .map((f) => ({
              id: String(f.id),
              name: String(f.name || 'Untitled'),
              kind: (f.kind === 'note' || f.kind === 'grid' || f.kind === 'vision' || f.kind === 'diagram' ? f.kind : 'diagram') as DocKind,
            }))
            .filter((f) => (kinds ? kinds.includes(f.kind) : true))
            .sort((a, b) => a.name.localeCompare(b.name));
          if (!cancelled) setFiles(next);
          return;
        }

        if (!ready || !supabase) return;
        const q = supabase.from('files').select('id,name,kind');
        const { data, error } = kinds && kinds.length ? await q.in('kind', kinds) : await q;
        if (error) throw error;
        const next: WorkspaceFile[] = (data || [])
          .map((r: any) => ({
            id: String(r?.id || ''),
            name: String(r?.name || 'Untitled'),
            kind: (r?.kind === 'note' || r?.kind === 'grid' || r?.kind === 'vision' || r?.kind === 'diagram' ? r.kind : 'diagram') as DocKind,
          }))
          .filter((f) => !!f.id)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setFiles(next);
      } catch {
        if (!cancelled) setFiles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
  }, [supabaseMode, ready, supabase, kindsKey]);

  return { files, loading, supabaseMode };
}

