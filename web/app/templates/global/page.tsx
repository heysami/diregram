import { Suspense } from 'react';
import GlobalTemplatesClient from './GlobalTemplatesClient';

export const dynamic = 'force-dynamic';

export default function GlobalTemplatesPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>}>
      <GlobalTemplatesClient />
    </Suspense>
  );
}

