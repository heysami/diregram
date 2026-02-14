'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';

export function useFileMarkdown(fileId: string | null) {
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setError(null);
      setLoading(true);
      try {
        if (!fileId) {
          if (!cancelled) setMarkdown('');
          return;
        }

        if (!supabaseMode) {
          const md = loadFileSnapshot(fileId) || '';
          if (!cancelled) setMarkdown(md);
          return;
        }

        if (!ready || !supabase) return;
        const { data, error } = await supabase.from('files').select('content').eq('id', fileId).maybeSingle();
        if (error) throw error;
        const md = String((data as any)?.content || '');
        if (!cancelled) setMarkdown(md);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || 'Failed to load file'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [fileId, supabaseMode, ready, supabase]);

  return { markdown, loading, error };
}

