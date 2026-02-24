'use client';

import { type ReactNode, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Boxes, Download, FileText, Link2, Sparkles, Workflow } from 'lucide-react';
import { AuthStatus } from '@/components/AuthStatus';
import { useAuth } from '@/hooks/use-auth';
import { DotGridOverlay } from '@/components/landing/DotGridOverlay';
import { ShaderFlowBackground } from '@/components/landing/ShaderFlowBackground';
import { DemoPreview } from '@/components/landing/DemoPreview';

function Wordmark({ text }: { text: string }) {
  const chars = useMemo(() => text.split(''), [text]);

  return (
    <div className="relative">
      <svg className="absolute h-0 w-0" aria-hidden focusable="false">
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur">
              <animate attributeName="stdDeviation" values="10;0" dur="1.5s" begin="1s" fill="freeze" />
            </feGaussianBlur>
            <feColorMatrix
              in="blur"
              mode="matrix"
              values={`1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 19 -9`}
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <h1
        className="dg-hero-wordmark relative z-10 text-[12vw] md:text-[10vw] leading-[0.8] font-bold tracking-tighter text-black mix-blend-hard-light"
        style={{ filter: 'url(#gooey)' }}
      >
        {chars.map((ch, index) => (
          <span key={`${ch}-${index}`} style={{ animationDelay: `${index * 0.05}s` }}>
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        ))}
      </h1>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  code,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  code: string;
}) {
  return (
    <div className="group relative overflow-hidden border border-black/20 bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(20,22,25,0.08)]">
      <div className="absolute right-0 top-0 p-2 opacity-15 transition-opacity group-hover:opacity-100">
        <div className="dg-dot-grid h-16 w-16" />
      </div>
      <div className="mb-6 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center border border-black/20 bg-[#eaedf1] text-black transition-colors group-hover:bg-[#E11D48] group-hover:text-white">
          {icon}
        </div>
        <span className="border border-neutral-200 px-1 text-[9px] uppercase tracking-[0.08em] text-neutral-400">{code}</span>
      </div>
      <h3 className="mb-2 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="border-l border-black/10 pl-3 text-sm leading-relaxed text-neutral-600">{description}</p>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { configured, ready, user } = useAuth();
  const signedIn = configured ? (ready ? Boolean(user) : false) : false;

  return (
    <main className="relative isolate min-h-screen overflow-x-hidden bg-[#f0f0f0] font-sans text-[#111] selection:bg-[#E11D48] selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-60">
        <ShaderFlowBackground />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0">
        <DotGridOverlay />
      </div>

      <div className="relative z-10">
      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-black/10 bg-[#f0f0f0]/90 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center mac-double-outline bg-white">
            <img src="/diregram-icon.svg" alt="Diregram" className="h-6 w-6" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Diregram</span>
        </div>

        <nav className="hidden items-center gap-2 text-[11px] tracking-[0.02em] md:flex">
          <a href="#features" className="rounded-sm px-3 py-2 text-neutral-600 transition-colors hover:text-black">
            Why Diregram?
          </a>
          <a href="#system" className="rounded-sm px-3 py-2 text-neutral-600 transition-colors hover:text-black">
            Demo
          </a>
          <a href="#footer" className="rounded-sm px-3 py-2 text-neutral-600 transition-colors hover:text-black">
            Contact
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(signedIn ? '/workspace' : `/login?next=${encodeURIComponent('/workspace')}`)}
            className="mac-btn mac-btn--dark mac-btn--lg"
          >
            Launch App
          </button>
          <AuthStatus />
        </div>
      </header>

      <section className="relative flex min-h-screen flex-col items-center justify-center border-b border-black/10 px-6 pt-20">
        <div className="absolute left-6 top-24 flex flex-col gap-1 text-[9px] uppercase tracking-[0.08em] text-neutral-400">
          <span>FIG. 01 — HERO</span>
          <span>SCALE: 1:1</span>
        </div>
        <div className="absolute right-6 top-24 text-right text-[9px] uppercase tracking-[0.08em] text-neutral-400">
          <span>RENDER_MODE: WIREFRAME</span>
          <span className="block">FPS: 60</span>
        </div>

        <div className="z-10 w-full max-w-5xl text-center">
          <div className="mb-8 flex justify-center">
            <div className="flex items-center gap-2 rounded-full border border-black/25 bg-white px-4 py-1.5 text-[10px] uppercase tracking-[0.08em] text-neutral-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#E11D48]" />
              System Online
            </div>
          </div>

          <div className="relative mb-8 flex justify-center">
            <div className="absolute inset-0 z-[-1] scale-110 -skew-x-12 border border-black/5" />
            <Wordmark text="DIREGRAM" />
          </div>

          <p className="mx-auto mb-12 max-w-xl text-center text-[17px] leading-relaxed text-neutral-600 md:text-[21px]">
            {'// Build app systems that stay correct at scale.'}
            <br />
            Markdown-first diagrams with linked flows, data, and context. AI-ready when you are.
          </p>

          <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
            <button
              type="button"
              onClick={() => router.push(signedIn ? '/workspace' : `/login?next=${encodeURIComponent('/workspace')}`)}
              className="mac-btn mac-btn--primary mac-btn--lg group px-8"
            >
              <span className="relative z-10 flex items-center gap-2 tracking-[0.08em]">
                Start building
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push('/download')}
              className="mac-btn mac-btn--lg px-8"
            >
              Download app
            </button>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 border-b border-black/10 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex items-end justify-between border-b border-black pb-4">
            <h2 className="text-4xl font-semibold tracking-tight">Why Diregram?</h2>
            <span className="text-xs uppercase tracking-[0.08em] text-neutral-500">[06 items]</span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<FileText className="h-6 w-6" />}
              title="Markdown Source Of Truth"
              description="Diagrams live as plain text you can diff, review, and version. No lock-in screenshots. No stale exports."
              code="SOURCE: MARKDOWN"
            />
            <FeatureCard
              icon={<Link2 className="h-6 w-6" />}
              title="Everything Connects"
              description="Link diagrams, notes, grids, tests, and data objects into one system graph. Context stays attached to the nodes."
              code="LINKS: FIRST-CLASS"
            />
            <FeatureCard
              icon={<Workflow className="h-6 w-6" />}
              title="Many Views, One System"
              description="Map, swimlane flows, tech flow, and data relationships all come from the same source, so your system stays coherent."
              code="VIEWS: 4X"
            />
            <FeatureCard
              icon={<Sparkles className="h-6 w-6" />}
              title="Knowledge Graph + RAG"
              description="Turn your workspace into queryable context for AI. Ask for the right thing and get answers grounded in your system."
              code="RAG: READY"
            />
            <FeatureCard
              icon={<Download className="h-6 w-6" />}
              title="Filesystem Sync"
              description="Sync to local Markdown vaults with conflict safety. Ship docs, templates, and AI bundles as part of your delivery system."
              code="SYNC: VAULT"
            />
            <FeatureCard
              icon={<Boxes className="h-6 w-6" />}
              title="Templates For Scale"
              description="Reusable blocks and templates keep teams consistent across projects, so you can grow without rewriting the system every time."
              code="REUSE: BUILT-IN"
            />
          </div>
        </div>
      </section>

      <section id="system" className="relative overflow-hidden border-b border-black/10 bg-white px-6 py-32">
        {/* Let the global shader show through here (gradient/flow), then add a light grid overlay. */}
        <div className="pointer-events-none absolute inset-0 bg-[#f0f0f0]/40 backdrop-blur-[1px]" />
        <div className="absolute inset-0 opacity-[0.06] dg-dot-grid" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="mb-16 flex flex-col items-start justify-between gap-8 md:flex-row">
            <div className="space-y-4">
              <div className="inline-block border border-black/25 bg-white/80 px-2 py-1 text-xs uppercase tracking-[0.08em] text-neutral-600">SECTION: WORKSPACE</div>
              <h2 className="max-w-2xl text-5xl font-bold tracking-tighter md:text-7xl">
                ONE WORKSPACE.
                <br />
                SIX <span className="dg-gradient-title">FILE TYPES</span>.
              </h2>
            </div>
            <p className="max-w-xs border-l border-black pl-4 pt-2 text-sm text-neutral-500">
              {'> SOURCE: MARKDOWN'}
              <br />
              {'> FILES: DIAGRAM / NOTE / GRID / VISION / TEMPLATE / TEST'}
              <br />
              {'> OUTPUT: LINKED CONTEXT'}
            </p>
          </div>

          <DemoPreview />
        </div>
      </section>

      <footer id="footer" className="border-t border-black bg-black px-6 py-20 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-12 md:flex-row">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/20 bg-white">
                <img src="/diregram-icon.svg" alt="Diregram" className="h-6 w-6" />
              </div>
              <span className="text-xl font-bold tracking-tight">Diregram</span>
            </div>
            <p className="max-w-xs text-sm text-neutral-500">
              {'// SYSTEM STATUS: OPERATIONAL'}
              <br />
              © 2026 Diregram Inc.
            </p>
          </div>

          <div className="flex gap-16 text-xs uppercase tracking-widest text-neutral-500">
            <div className="flex flex-col gap-4">
              <span className="border-b border-white/20 pb-2 font-bold text-white">Product</span>
              <Link href="/download" className="transition-colors hover:text-[#E11D48]">Download</Link>
              <Link href="/workspace" className="transition-colors hover:text-[#E11D48]">Workspace</Link>
              <Link href="/templates/global" className="transition-colors hover:text-[#E11D48]">Templates</Link>
            </div>
            <div className="flex flex-col gap-4">
              <span className="border-b border-white/20 pb-2 font-bold text-white">Resources</span>
              <Link href="/account" className="transition-colors hover:text-[#E11D48]">Account</Link>
              <Link href="/workspace" className="transition-colors hover:text-[#E11D48]">Projects</Link>
              <Link href="/download" className="transition-colors hover:text-[#E11D48]">Desktop</Link>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </main>
  );
}
