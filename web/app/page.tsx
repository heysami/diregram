'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AuthStatus } from '@/components/AuthStatus';
import { FileText, Network, Table, Sparkles, LayoutTemplate } from 'lucide-react';
import { DiregramMark } from '@/components/DiregramMark';

export default function Home() {
  const router = useRouter();
  const { configured, ready, user } = useAuth();
  const signedIn = configured ? (ready ? !!user : false) : false;

  return (
    <main className="mac-desktop min-h-screen flex flex-col">
      <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => router.push('/')} className="text-left">
            <h1 className="text-[13px] font-bold tracking-tight">
              <span aria-hidden className="mr-1 select-none inline-flex items-center align-middle">
                <DiregramMark size={14} />
              </span>
              Diregram <span className="text-[11px] font-normal opacity-70">Connected diagrams</span>
            </h1>
          </button>
          <div className="text-[12px] opacity-70 hidden sm:block">Maps · Flows · Data</div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="mac-btn h-8 flex items-center gap-1.5" onClick={() => router.push('/templates/global')}>
            <LayoutTemplate size={14} />
            Global templates
          </button>
          <AuthStatus />
        </div>
      </header>

      <div className="flex-1">
        <div className="mx-auto w-full max-w-[980px] px-6 py-12 sm:py-16">
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-[30px] leading-tight font-bold tracking-tight">
                A workspace for building apps—maps, grids, and notes.
              </h2>
              <p className="text-sm opacity-80 max-w-[760px]">
                Diregram organizes your project into a few simple file types so you can capture architecture, requirements, and
                decisions in a form that’s easy to browse, share, and feed to an LLM.
              </p>
              <div className="text-xs opacity-80 max-w-[780px]">
                Use a <span className="font-semibold">Map</span> to model systems and flows, a <span className="font-semibold">Grid</span> to
                track structured data like endpoints or schemas, and a <span className="font-semibold">Note</span> for narrative context and
                rationale—all in one workspace.
              </div>
              <div className="pt-1">
                {!signedIn ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="mac-btn mac-btn--primary"
                      onClick={() => router.push(`/login?next=${encodeURIComponent('/workspace')}`)}
                    >
                      Sign in to start
                    </button>
                    <button type="button" className="mac-btn" onClick={() => router.push('/download')}>
                      Download desktop app (macOS)
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" className="mac-btn mac-btn--primary" onClick={() => router.push('/workspace')}>
                      Open workspace
                    </button>
                    <button type="button" className="mac-btn" onClick={() => router.push('/templates/global')}>
                      Browse global templates
                    </button>
                    <button type="button" className="mac-btn" onClick={() => router.push('/download')}>
                      Download desktop app (macOS)
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Network size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Maps (diagrams)</div>
                <div className="mt-1 text-xs opacity-80">
                  Model architecture, flows, and relationships. Great for system overviews and “how it works” explanations.
                </div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Table size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Grids (tables)</div>
                <div className="mt-1 text-xs opacity-80">
                  Capture structured specs like endpoints, fields, permissions, test cases, or migration checklists.
                </div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <FileText size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Notes</div>
                <div className="mt-1 text-xs opacity-80">
                  Write context and decisions alongside the work—requirements, trade-offs, meeting notes, and implementation plans.
                </div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Sparkles size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Useful for LLMs</div>
                <div className="mt-1 text-xs opacity-80">
                  Structured files make better prompts. Ask an LLM to generate code, fill grids, or refactor maps with less ambiguity.
                </div>
              </div>
            </div>

            <div className="mac-window mac-double-outline p-5">
              <div className="text-[14px] font-bold tracking-tight">Why these file types help</div>
              <div className="mt-2 grid gap-3 md:grid-cols-3 text-xs opacity-85">
                <div>
                  <div className="font-semibold">Fast navigation</div>
                  <div className="mt-1 opacity-80">Pick the right format for the job and scan projects quickly by icon and type.</div>
                </div>
                <div>
                  <div className="font-semibold">Less ambiguity</div>
                  <div className="mt-1 opacity-80">Maps show structure, grids show facts, notes show intent—so collaborators align faster.</div>
                </div>
                <div>
                  <div className="font-semibold">Better automation</div>
                  <div className="mt-1 opacity-80">When you hand this workspace to an LLM, it can act on clearer, more complete inputs.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

