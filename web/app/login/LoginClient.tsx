'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { isLocalAdminLoginEnabled, LOCAL_ADMIN_USERNAME, setLocalAdminSession } from '@/lib/local-admin-session';
import { DiregramMark } from '@/components/DiregramMark';

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configured = isSupabaseConfigured();
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient>>(null);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [emailSentTo, setEmailSentTo] = useState<string>('');
  const [code, setCode] = useState('');
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
            <span aria-hidden className="mr-1 select-none inline-flex items-center align-middle">
              <DiregramMark size={14} />
            </span>
            Diregram <span className="text-[11px] font-normal opacity-70">Login</span>
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
            ) : (
              <>
                {step === 'email' ? (
                  <>
                    <div className="text-xs opacity-80">Enter your email and we’ll send a sign-in code.</div>
                    <input
                      className="mac-field w-full"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      inputMode="email"
                    />
                  </>
                ) : (
                  <>
                    <div className="text-xs opacity-80">
                      Enter the code from your email{emailSentTo ? ` (${emailSentTo})` : ''}.
                    </div>
                    <input
                      className="mac-field w-full"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </>
                )}
                {error ? <div className="text-xs">{error}</div> : null}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="mac-btn" onClick={() => router.push('/')}>
                    Cancel
                  </button>
                  {step === 'code' ? (
                    <button
                      type="button"
                      className="mac-btn"
                      disabled={loading}
                      onClick={async () => {
                        setError(null);
                        setLoading(true);
                        try {
                          const next = searchParams?.get('next') || '/workspace';
                          const { error: err } = await supabase.auth.signInWithOtp({
                            email: emailSentTo,
                            options: {
                              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
                                next.startsWith('/') ? next : '/',
                              )}`,
                            },
                          });
                          if (err) setError(err.message);
                          else {
                            setCode('');
                          }
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Resend code
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="mac-btn mac-btn--primary"
                    disabled={loading || (step === 'email' ? !email.trim() : !code.trim())}
                    onClick={async () => {
                      setError(null);
                      setLoading(true);
                      try {
                        const next = searchParams?.get('next') || '/workspace';
                        if (step === 'email') {
                          const input = email.trim().toLowerCase();
                          if (isLocalAdminLoginEnabled() && input === LOCAL_ADMIN_USERNAME) {
                            setLocalAdminSession();
                            router.replace(next.startsWith('/') ? next : '/');
                            return;
                          }
                          const emailTrimmed = email.trim();
                          const { error: err } = await supabase.auth.signInWithOtp({
                            email: emailTrimmed,
                            options: {
                              // Route handler exchanges the code for a session cookie (magic link fallback).
                              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
                                next.startsWith('/') ? next : '/',
                              )}`,
                            },
                          });
                          if (err) setError(err.message);
                          else {
                            setEmailSentTo(emailTrimmed);
                            setCode('');
                            setStep('code');
                          }
                        } else {
                          const { error: err } = await supabase.auth.verifyOtp({
                            email: emailSentTo,
                            token: code.trim(),
                            type: 'email',
                          });
                          if (err) {
                            setError(err.message);
                          } else {
                            router.replace(next.startsWith('/') ? next : '/');
                          }
                        }
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    {step === 'email' ? 'Send code' : 'Verify'}
                  </button>
                </div>
                {step === 'code' ? (
                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      className="mac-btn"
                      disabled={loading}
                      onClick={() => {
                        setError(null);
                        setCode('');
                        setStep('email');
                      }}
                    >
                      Change email
                    </button>
                    <div className="text-[11px] opacity-70">Tip: open the email on your phone and type the code here.</div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

