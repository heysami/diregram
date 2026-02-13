'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { normalizeLayoutDirection, type LayoutDirection } from '@/lib/layout-direction';
import { fetchProfileDefaultLayoutDirection, updateProfileDefaultLayoutDirection } from '@/lib/layout-direction-supabase';

export default function AccountClient() {
  const router = useRouter();
  const { configured, supabase, ready, user, signOut } = useAuth();
  const [defaultLayoutDirection, setDefaultLayoutDirection] = useState<LayoutDirection>('horizontal');
  const [savingLayoutDirection, setSavingLayoutDirection] = useState(false);

  useEffect(() => {
    if (!configured) return;
    if (!ready) return;
    if (!supabase) return;
    if (!user?.id) return;
    let cancelled = false;
    fetchProfileDefaultLayoutDirection(supabase, user.id).then((dir) => {
      if (cancelled) return;
      setDefaultLayoutDirection(dir);
    });
    return () => {
      cancelled = true;
    };
  }, [configured, ready, supabase, user?.id]);

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10 relative">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => router.push('/')} className="text-left">
            <h1 className="text-[13px] font-bold tracking-tight">
              <span aria-hidden className="mr-1 select-none"></span>
              Diregram <span className="text-[11px] font-normal opacity-70">Account</span>
            </h1>
          </button>
        </div>
        <button type="button" className="mac-btn" onClick={() => router.push('/workspace')}>
          Home
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="mac-window w-[640px] max-w-[92vw] overflow-hidden">
          <div className="mac-titlebar">
            <div className="mac-title">Profile</div>
          </div>
          <div className="p-4 space-y-3 text-xs">
            {!configured ? (
              <div>Supabase auth is not configured.</div>
            ) : !supabase ? (
              <div>Loading…</div>
            ) : !ready ? (
              <div>Loading…</div>
            ) : !user ? (
              <div className="space-y-2">
                <div>You’re signed out.</div>
                <button type="button" className="mac-btn mac-btn--primary" onClick={() => router.push('/login')}>
                  Sign in
                </button>
              </div>
            ) : (
              <>
                <div className="mac-double-outline p-3">
                  <div>
                    <span className="font-semibold">Email:</span> {user.email}
                  </div>
                  <div>
                    <span className="font-semibold">User ID:</span> <span className="font-mono">{user.id}</span>
                  </div>
                </div>

                <div className="mac-double-outline p-3 space-y-2">
                  <div className="font-semibold">Defaults</div>
                  <div className="flex items-center justify-between gap-3">
                    <div>New file layout</div>
                    <select
                      className="mac-field h-7"
                      value={defaultLayoutDirection}
                      disabled={!configured || !supabase || savingLayoutDirection}
                      onChange={async (e) => {
                        const next = normalizeLayoutDirection(e.target.value);
                        setDefaultLayoutDirection(next);
                        if (!supabase || !user?.id) return;
                        setSavingLayoutDirection(true);
                        try {
                          await updateProfileDefaultLayoutDirection(supabase, user.id, next);
                        } finally {
                          setSavingLayoutDirection(false);
                        }
                      }}
                      title="Default layout direction for new files"
                    >
                      <option value="horizontal">Horizontal (grow right)</option>
                      <option value="vertical">Vertical (grow down)</option>
                    </select>
                  </div>
                  <div className="text-[11px] opacity-70">
                    Per-file layout can be changed in the editor; this sets the default for new files (and for existing files
                    that don’t have an override yet).
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="mac-btn"
                    onClick={async () => {
                      await signOut();
                      router.push('/');
                    }}
                  >
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

