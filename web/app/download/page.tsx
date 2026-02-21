export const dynamic = 'force-dynamic';

const RELEASES_LATEST_URL = 'https://github.com/heysami/diregram/releases/latest';

export default function DownloadPage() {
  return (
    <main className="mac-desktop min-h-screen flex flex-col">
      <div className="mx-auto w-full max-w-[860px] px-6 py-12 sm:py-16 space-y-6">
        <div className="space-y-2">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight">Download Diregram Sync (macOS)</h1>
          <div className="text-sm opacity-80">
            Diregram Sync keeps a local Markdown vault (Obsidian / OneDrive folder) bidirectionally synced with your Diregram account.
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
          <div className="text-xs opacity-75">
            Tip: Apple Silicon Macs should pick <span className="font-semibold">arm64 / aarch64</span>. Intel Macs should pick{' '}
            <span className="font-semibold">x86_64</span>.
          </div>
        </div>

        <div className="mac-window mac-double-outline p-5 space-y-3">
          <div className="text-[14px] font-bold tracking-tight">2) First run</div>
          <div className="text-xs opacity-85 space-y-2">
            <div>- Sign in with your email (the app will ask for a one-time code).</div>
            <div>- Paste your OpenAI API key if you want “Reindex (RAG)” to work (stored locally in Keychain).</div>
            <div>
              - Choose your vault folder. Sync starts automatically and pulls all your Diregram projects into{' '}
              <span className="font-semibold">`Diregram/&lt;ProjectName&gt;__/…`</span>.
            </div>
            <div>- The app also writes a full AI workflow bundle into `Diregram AI/`.</div>
          </div>
        </div>

        <div className="mac-window mac-double-outline p-5 space-y-3">
          <div className="text-[14px] font-bold tracking-tight">3) Sync behavior</div>
          <div className="text-xs opacity-85 space-y-2">
            <div>- Sync runs continuously (push + pull) even if you close the window (it hides to the tray).</div>
            <div>- Conflicts create a separate “(conflict from Diregram …).md” file and are listed in “View events”.</div>
            <div>- Deletions archive the last remote copy under `.diregram/trash/`.</div>
            <div>
              - Docling imports (additional resources) are synced into <span className="font-semibold">`resources/`</span> (Docling under
              `resources/docling/`).
            </div>
            <div>
              - RAG/KG exports are synced into <span className="font-semibold">`rag/`</span> (JSON/JSONL snapshots).
            </div>
          </div>
        </div>

        <div className="mac-window mac-double-outline p-5 space-y-3">
          <div className="text-[14px] font-bold tracking-tight">If macOS blocks the app</div>
          <div className="text-xs opacity-85 space-y-2">
            <div>
              - Signed + notarized builds open normally. Unsigned builds may show a Gatekeeper warning on first run.
            </div>
            <div>
              - Temporary workaround (developer/testing only): run{' '}
              <span className="font-semibold">`xattr -dr com.apple.quarantine "/Applications/Diregram Sync.app"`</span>.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

