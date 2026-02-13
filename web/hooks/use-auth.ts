'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { clearLocalAdminSession, getLocalAdminSession } from '@/lib/local-admin-session';

export type AuthUser = {
  id: string;
  email?: string;
  isLocalAdmin?: boolean;
};

export function useAuth() {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<AuthUser | null>(null);
  const [localAdminUser, setLocalAdminUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const local = getLocalAdminSession();
    if (local) {
      setLocalAdminUser({ id: local.id, email: local.email, isLocalAdmin: true });
      setReady(true);
    } else {
      setLocalAdminUser(null);
    }

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
      setSupabaseUser(
        data.session?.user
          ? { id: data.session.user.id, email: data.session.user.email }
          : null,
      );
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSupabaseUser(next?.user ? { id: next.user.id, email: next.user.email } : null);
      setReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [configured, supabase]);

  // Ensure the current user has a profile row (required for FKs like folders.owner_id/files.owner_id).
  useEffect(() => {
    if (!configured) return;
    if (!supabase) return;
    if (!supabaseUser) return;
    // Best-effort: ignore errors (RLS/duplicate/etc).
    supabase.from('profiles').upsert({ id: supabaseUser.id, email: supabaseUser.email ?? null }).then(() => {
      // ignore
    });
  }, [configured, supabase, supabaseUser?.id]);

  const user = supabaseUser || localAdminUser;

  return {
    configured,
    supabase,
    ready,
    session,
    user,
    async signOut() {
      clearLocalAdminSession();
      setLocalAdminUser(null);
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}

