import { Suspense } from 'react';
import WorkspaceClient from './WorkspaceClient';

// Prevent build-time prerendering failures (client hooks like useSearchParams inside RequireAuth).
export const dynamic = 'force-dynamic';

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>}>
      <WorkspaceClient />
    </Suspense>
  );
}

