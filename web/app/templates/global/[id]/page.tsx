import { Suspense } from 'react';
import GlobalTemplateDetailClient from './GlobalTemplateDetailClient';

export const dynamic = 'force-dynamic';

export default function GlobalTemplateDetailPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>}>
      <GlobalTemplateDetailClient />
    </Suspense>
  );
}

