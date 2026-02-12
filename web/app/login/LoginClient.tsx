'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configured = isSupabaseConfigured();
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient>>(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!configured) return;
    setSupabase(createClient());
  }, [configured]);

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10 relative">
        <div className="flex items-center gap-4">
          <h1 className="text-[13px] font-bold tracking-tight">
            <span aria-hidden className="mr-1 select-none"></span>
            NexusMap <span className="text-[11px] font-normal opacity-70">Login</span>
          </h1>
        </div>
        <button type="button" className="mac-btn" onClick={() => router.push('/')}>
          Back
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="mac-window w-[520px] max-w-[92vw] overflow-hidden">
          <div className="mac-titlebar">
            <div className="mac-title">Sign in</div>
          </div>
          <div className="p-4 space-y-3">
            {!configured ? (
              <div className="text-xs">
                Supabase auth is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
              </div>
            ) : !supabase ? (
              <div className="text-xs opacity-80">Loading…</div>
            ) : sent ? (
              <div className="text-xs">
                Check your email for a magic link. After signing in, you’ll be redirected back automatically (or you can go Home).
              </div>
            ) : (
              <>
                <div className="text-xs opacity-80">Enter your email and we’ll send a magic link.</div>
                <input
                  className="mac-field w-full"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  inputMode="email"
                />
                {error ? <div className="text-xs">{error}</div> : null}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="mac-btn" onClick={() => router.push('/')}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="mac-btn mac-btn--primary"
                    disabled={loading || !email.trim()}
                    onClick={async () => {
                      setError(null);
                      setLoading(true);
                      try {
                        const next = searchParams?.get('next') || '/';
                        const { error: err } = await supabase.auth.signInWithOtp({
                          email: email.trim(),
                          options: { emailRedirectTo: `${window.location.origin}${next.startsWith('/') ? next : '/'}` },
                        });
                        if (err) setError(err.message);
                        else setSent(true);
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Send link
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

