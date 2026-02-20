export const dynamic = 'force-dynamic';

const RELEASES_LATEST_URL = 'https://github.com/heysami/diregram/releases/latest';

export default function DownloadPage() {
  return (
    <main className="mac-desktop min-h-screen flex flex-col">
      <div className="mx-auto w-full max-w-[860px] px-6 py-12 sm:py-16 space-y-6">
        <div className="space-y-2">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight">Download NexusMap Sync (macOS)</h1>
          <div className="text-sm opacity-80">
            NexusMap Sync keeps a local Markdown vault (Obsidian / OneDrive folder) bidirectionally synced with your NexusMap project.
          </div>
        </div>

        <div className="mac-window mac-double-outline p-5 space-y-3">
          <div className="text-[14px] font-bold tracking-tight">1) Download</div>
          <div className="text-xs opacity-85">
            Download the latest macOS installer from GitHub Releases:
          </div>
          <a className="mac-btn mac-btn--primary inline-flex" href={RELEASES_LATEST_URL} target="_blank" rel="noreferrer">
            Open GitHub Releases (latest)
          </a>
        </div>

        <div className="mac-window mac-double-outline p-5 space-y-3">
          <div className="text-[14px] font-bold tracking-tight">2) First run</div>
          <div className="text-xs opacity-85 space-y-2">
            <div>- Sign in (OAuth).</div>
            <div>- Choose your vault folder.</div>
            <div>- Select or create a NexusMap project.</div>
            <div>- Click “Initialize mapping” (creates `.nexusmap/sync.json` + writes `NexusMap AI Guide.md`).</div>
            <div>- Click “Initial import” to push your vault into NexusMap.</div>
          </div>
        </div>

        <div className="mac-window mac-double-outline p-5 space-y-3">
          <div className="text-[14px] font-bold tracking-tight">3) Sync behavior</div>
          <div className="text-xs opacity-85 space-y-2">
            <div>- “Start watching” syncs local changes → NexusMap.</div>
            <div>- “Start remote poll” pulls NexusMap changes → your vault.</div>
            <div>- Conflicts create a separate “(conflict from NexusMap …).md” file and are listed in “View events”.</div>
            <div>- Deletions archive the last remote copy under `.nexusmap/trash/`.</div>
          </div>
        </div>

        <div className="mac-window mac-double-outline p-5 space-y-3">
          <div className="text-[14px] font-bold tracking-tight">Supabase redirect URL</div>
          <div className="text-xs opacity-85">
            For desktop OAuth, add the redirect URL <span className="font-semibold">`nexusmap://auth/callback`</span> in your Supabase Auth
            settings (Allowed Redirect URLs).
          </div>
        </div>
      </div>
    </main>
  );
}

