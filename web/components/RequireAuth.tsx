'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

type Props = {
  children: React.ReactNode;
};

/**
 * Client-side auth gate.
 *
 * Behavior:
 * - If Supabase is NOT configured (env vars missing), allow access (local-only mode).
 * - If Supabase is configured but the user is signed out, redirect to /login and preserve return URL.
 */
export function RequireAuth({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { configured, supabase, ready, user } = useAuth();

  const returnTo = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;

  useEffect(() => {
    if (!configured) return; // local-only mode
    if (!ready) return;
    if (user) return;
    router.replace(`/login?next=${encodeURIComponent(returnTo)}`);
  }, [configured, ready, user, router, returnTo]);

  if (!configured) return <>{children}</>;

  if (!ready) {
    return <div className="flex h-screen items-center justify-center text-xs opacity-80">Checking session…</div>;
  }

  if (!user) {
    return <div className="flex h-screen items-center justify-center text-xs opacity-80">Redirecting to login…</div>;
  }

  return <>{children}</>;
}

