import { Suspense } from 'react';
import LoginClient from './LoginClient';

// Prevent build-time prerendering failures (e.g. auth/searchParams usage).
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>}>
      <LoginClient />
    </Suspense>
  );
}
