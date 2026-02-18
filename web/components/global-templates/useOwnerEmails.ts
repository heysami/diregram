'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/is-uuid';

export function useOwnerEmails(opts: { enabled: boolean; supabase: SupabaseClient | null; ownerIds: string[] }) {
  const { enabled, supabase, ownerIds } = opts;
  const [ownerEmailById, setOwnerEmailById] = useState<Record<string, string>>({});

  const uniqueIds = useMemo(() => Array.from(new Set((ownerIds || []).filter((id) => isUuid(id)))), [ownerIds]);

  useEffect(() => {
    if (!enabled) return;
    if (!supabase) return;
    if (!uniqueIds.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('id,email').in('id', uniqueIds);
        if (error) throw error;
        if (cancelled) return;
        const next: Record<string, string> = {};
        (data || []).forEach((r: any) => {
          const id = String(r?.id || '');
          const email = typeof r?.email === 'string' ? String(r.email) : '';
          if (id) next[id] = email || id.slice(0, 8);
        });
        setOwnerEmailById((prev) => ({ ...prev, ...next }));
      } catch {
        // ignore (fallback to ownerId)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, supabase, uniqueIds]);

  return { ownerEmailById };
}

