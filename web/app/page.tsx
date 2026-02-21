'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AuthStatus } from '@/components/AuthStatus';
import { FileText, Network, Table, Sparkles, LayoutTemplate, Workflow, LayoutDashboard, Database, Download, Package, Share2 } from 'lucide-react';
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
          <div className="text-[12px] opacity-70 hidden sm:block">Playbooks · Decisions · AI-ready</div>
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
                A living client playbook your AI can actually use.
              </h2>
              <p className="text-sm opacity-80 max-w-[760px]">
                Diregram turns messy discovery notes into a structured system: site map, swimlane journeys, tech flows, and data
                relationships—packaged as portable Markdown you can reuse with AI, hand off to clients, and keep consistent.
              </p>
              <div className="text-xs opacity-80 max-w-[780px]">
                You curate the decisions. Diregram keeps them organized. Then AI can draft, check, and summarize using the same
                source of truth (instead of guessing from scattered docs).
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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Network size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Four connected views</div>
                <div className="mt-1 text-xs opacity-80">
                  Switch between <span className="font-semibold">Site Map</span>, <span className="font-semibold">Flow</span>,{' '}
                  <span className="font-semibold">Tech Flow</span>, and <span className="font-semibold">Data Relationship</span>—all tied to the
                  same source content.
                </div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Sparkles size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">AI guardrails included</div>
                <div className="mt-1 text-xs opacity-80">
                  Download the AI prompt + verification checklists, validate imports, export a bundle, then build a queryable
                  knowledge base when you’re ready.
                </div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <FileText size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Deliverables that stay live</div>
                <div className="mt-1 text-xs opacity-80">
                  Notes can embed a live view of a swimlane flow, a tech flow, the site map, data relationships, and even Vision
                  cards—so handoffs don’t drift out of sync.
                </div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <LayoutTemplate size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Templates (3 levels)</div>
                <div className="mt-1 text-xs opacity-80">
                  Reuse patterns across engagements with <span className="font-semibold">Project</span>,{' '}
                  <span className="font-semibold">Account</span>, and <span className="font-semibold">Global</span> templates.
                </div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Share2 size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Semantic export + Knowledge Base</div>
                <div className="mt-1 text-xs opacity-80">
                  Export a semantic knowledge graph, build a searchable knowledge base (RAG), and connect it to tools like Cursor via
                  MCP—so AI can answer using your project context.
                </div>
              </div>

              <div className="mac-window mac-double-outline p-5">
                <div className="mac-double-outline inline-flex p-3">
                  <Download size={22} />
                </div>
                <div className="mt-3 text-[14px] font-bold tracking-tight">Desktop vault sync (Obsidian/OneDrive)</div>
                <div className="mt-1 text-xs opacity-80">
                  Diregram Sync keeps a local Markdown vault in sync, handles conflicts safely, writes an AI workflow bundle, and
                  can export resources and knowledge snapshots into your folder.
                </div>
              </div>
            </div>

            <div className="mac-window mac-double-outline p-5">
              <div className="text-[14px] font-bold tracking-tight">How it works (the full workflow)</div>
              <div className="mt-3 grid gap-4 md:grid-cols-4 text-xs opacity-85">
                <div className="mac-double-outline p-4">
                  <div className="flex items-center gap-2">
                    <Download size={16} />
                    <div className="font-semibold">1) Bring in sources</div>
                  </div>
                  <div className="mt-2 opacity-80">
                    Import Mermaid, paste AI-generated Markdown, or convert PDFs/docs into clean Markdown resources (Docling) for
                    reliable referencing.
                  </div>
                </div>
                <div className="mac-double-outline p-4">
                  <div className="flex items-center gap-2">
                    <Workflow size={16} />
                    <div className="font-semibold">2) Model the reality</div>
                  </div>
                  <div className="mt-2 opacity-80">
                    Use the right view for the right decision: journeys with swimlanes, system tech flows, and data relationships—
                    plus comments, annotations, and tags.
                  </div>
                </div>
                <div className="mac-double-outline p-4">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate size={16} />
                    <div className="font-semibold">3) Package as templates</div>
                  </div>
                  <div className="mt-2 opacity-80">
                    Save your best patterns as templates and reuse them across clients—without copy/paste drift.
                  </div>
                </div>
                <div className="mac-double-outline p-4">
                  <div className="flex items-center gap-2">
                    <Package size={16} />
                    <div className="font-semibold">4) Use with AI</div>
                  </div>
                  <div className="mt-2 opacity-80">
                    Download the AI guides + checklists, export a bundle, and (optionally) build a knowledge base so AI can answer
                    with your context.
                  </div>
                </div>
              </div>
            </div>

            <div className="mac-window mac-double-outline p-5">
              <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
                <div className="min-w-0">
                  <div className="text-[14px] font-bold tracking-tight">Start your next client playbook</div>
                  <div className="mt-1 text-xs opacity-80 max-w-[680px]">
                    Capture the decisions once, then reuse them with AI prompts, checklists, exports, and an optional knowledge base.
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {!signedIn ? (
                    <>
                      <button
                        type="button"
                        className="mac-btn mac-btn--primary"
                        onClick={() => router.push(`/login?next=${encodeURIComponent('/workspace')}`)}
                      >
                        Sign in to start
                      </button>
                      <button type="button" className="mac-btn" onClick={() => router.push('/templates/global')}>
                        Browse global templates
                      </button>
                      <button type="button" className="mac-btn" onClick={() => router.push('/download')}>
                        Download desktop app (macOS)
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="mac-btn mac-btn--primary" onClick={() => router.push('/workspace')}>
                        Open workspace
                      </button>
                      <button type="button" className="mac-btn" onClick={() => router.push('/templates/global')}>
                        Browse global templates
                      </button>
                      <button type="button" className="mac-btn" onClick={() => router.push('/download')}>
                        Download desktop app (macOS)
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

