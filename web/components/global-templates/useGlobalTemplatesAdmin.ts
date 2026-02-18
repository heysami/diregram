'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/is-uuid';
import { isGlobalTemplatesAdmin } from '@/lib/global-templates';

export function useGlobalTemplatesAdmin(opts: { enabled: boolean; supabase: SupabaseClient | null; userId: string | null | undefined }) {
  const { enabled, supabase, userId } = opts;
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!supabase) return;
    const uid = typeof userId === 'string' ? userId : '';
    if (!isUuid(uid)) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const ok = await isGlobalTemplatesAdmin(supabase, uid);
      if (cancelled) return;
      setIsAdmin(ok);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, supabase, userId]);

  return { isAdmin, loading };
}

