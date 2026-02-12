'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export function AuthStatus() {
  const router = useRouter();
  const { supabase, ready, user, signOut } = useAuth();

  if (!supabase) {
    return <div className="text-[11px] opacity-70">Auth: not configured</div>;
  }

  if (!ready) {
    return <div className="text-[11px] opacity-70">Auth: …</div>;
  }

  if (!user) {
    return (
      <button type="button" className="mac-btn" onClick={() => router.push('/login')}>
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="mac-btn" onClick={() => router.push('/account')} title="Account">
        {user.email || 'Account'}
      </button>
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
  );
}

