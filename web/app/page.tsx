'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AuthStatus } from '@/components/AuthStatus';
import { FileText, Sparkles, Network } from 'lucide-react';

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
              <span aria-hidden className="mr-1 select-none"></span>
              Diregram <span className="text-[11px] font-normal opacity-70">Connected diagrams</span>
            </h1>
          </button>
          <div className="text-[12px] opacity-70 hidden sm:block">Maps · Flows · Data</div>
        </div>
        <div className="flex items-center gap-3">
          <AuthStatus />
        </div>
      </header>

      <div className="flex-1">
        <div className="mx-auto w-full max-w-[980px] px-6 py-12 sm:py-16">
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-[30px] leading-tight font-bold tracking-tight">
                Diagrams with meaning—built for LLMs.
              </h2>
              <p className="text-sm opacity-80 max-w-[760px]">
                Diregram is a diagram tool where diagrams carry semantic meaning—so an LLM can construct them fast and turn your
                application description into an actual implementation.
              </p>
              <div className="pt-1">
                {!signedIn ? (
                  <button
                    type="button"
                    className="mac-btn mac-btn--primary"
                    onClick={() => router.push(`/login?next=${encodeURIComponent('/workspace')}`)}
                  >
                    Sign in to start
                  </button>
                ) : (
                  <button type="button" className="mac-btn mac-btn--primary" onClick={() => router.push('/workspace')}>
                    Open workspace
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <FileText size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Semantic Markdown</div>
                <div className="mt-1 text-xs opacity-80">A Markdown form that preserves meaning, not just shapes.</div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Sparkles size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">LLM-friendly</div>
                <div className="mt-1 text-xs opacity-80">Generate, expand, and refactor diagrams with prompts.</div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Network size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Connected views</div>
                <div className="mt-1 text-xs opacity-80">Maps, flows, and data link together to describe an app.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

