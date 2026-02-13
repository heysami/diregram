'use client';

import { useRouter } from 'next/navigation';
import { AuthStatus } from '@/components/AuthStatus';
import { RequireAuth } from '@/components/RequireAuth';
import { WorkspaceBrowser } from '@/components/WorkspaceBrowser';
import { WorkspaceBrowserSupabase } from '@/components/WorkspaceBrowserSupabase';
import { useAuth } from '@/hooks/use-auth';

export default function WorkspaceClient() {
  const router = useRouter();
  const { configured } = useAuth();

  return (
    <RequireAuth>
      <main className="mac-desktop flex h-screen flex-col">
        <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10 relative">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => router.push('/')} className="text-left">
              <h1 className="text-[13px] font-bold tracking-tight">
                <span aria-hidden className="mr-1 select-none"></span>
                Diregram <span className="text-[11px] font-normal opacity-70">Workspace</span>
              </h1>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <AuthStatus />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {configured ? <WorkspaceBrowserSupabase /> : <WorkspaceBrowser />}
        </div>
      </main>
    </RequireAuth>
  );
}

