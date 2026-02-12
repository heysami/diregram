'use client';

import { useRouter } from 'next/navigation';
import { FilesPanel } from '@/components/FilesPanel';
import { AuthStatus } from '@/components/AuthStatus';

export default function Home() {
  const router = useRouter();

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10 relative">
        <div className="flex items-center gap-4">
          <h1 className="text-[13px] font-bold tracking-tight">
            <span aria-hidden className="mr-1 select-none"></span>
            NexusMap <span className="text-[11px] font-normal opacity-70">Home</span>
          </h1>
          <div className="text-[12px] opacity-70">Projects · Folders · Files</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[12px] opacity-70">Pick a file to open</div>
          <AuthStatus />
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 p-6">
          <div className="mac-window max-w-[720px] overflow-hidden">
            <div className="mac-titlebar">
              <div className="mac-title">Workspace</div>
            </div>
            <div className="p-4">
              <div className="text-[12px] font-semibold mb-2">Your files</div>
              <FilesPanel
                activeFileId={null}
                onOpenFile={(file) => {
                  router.push(`/editor?file=${encodeURIComponent(file.id)}`);
                }}
              />
              <div className="mt-3 text-[11px] opacity-70">
                Note: this is currently a local-only workspace (saved to your browser). Supabase folders/files/ACL will plug in here next.
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

