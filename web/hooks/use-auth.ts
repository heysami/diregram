'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

export function useAuth() {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    // Create the browser client after mount to avoid build-time prerender issues.
    const client = createClient();
    setSupabase(client);
    if (!client) {
      // Misconfigured or non-browser environment (shouldn't happen in normal client runtime).
      setReady(true);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    if (!supabase) return;

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      setUser(data.session?.user || null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user || null);
      setReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [configured, supabase]);

  return {
    configured,
    supabase,
    ready,
    session,
    user,
    async signOut() {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}

