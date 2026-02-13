'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export default function AccountClient() {
  const router = useRouter();
  const { configured, supabase, ready, user, signOut } = useAuth();

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

