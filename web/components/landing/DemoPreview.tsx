'use client';

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileText, Network, Table2 } from 'lucide-react';

type Size = { w: number; h: number };
type Point = { x: number; y: number };

type DemoKind = 'diagram' | 'note' | 'grid' | 'vision';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toLocalPoint(containerRect: DOMRect, rect: DOMRect, pt: Point): Point {
  return {
    x: pt.x - containerRect.left,
    y: pt.y - containerRect.top,
  };
}

function rightMid(rect: DOMRect): Point {
  // Nudge outside the card so the stroke doesn't disappear under the node surface.
  return { x: rect.right + 6, y: rect.top + rect.height * 0.52 };
}

function leftMid(rect: DOMRect): Point {
  return { x: rect.left - 6, y: rect.top + rect.height * 0.52 };
}

function cubicBetween(a: Point, b: Point): string {
  // Gentle rightward curve that enters/leaves nodes horizontally (avoids lines "hiding" behind cards).
  const dx = b.x - a.x;
  const bendX = clamp(Math.abs(dx) * 0.55, 90, 280);

  const c1 = { x: a.x + bendX, y: a.y };
  const c2 = { x: b.x - bendX, y: b.y };

  const f = (n: number) => Number.isFinite(n) ? n.toFixed(1) : '0';
  return `M ${f(a.x)} ${f(a.y)} C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(b.x)} ${f(b.y)}`;
}

export function DemoPreview() {
  const order: DemoKind[] = useMemo(() => ['diagram', 'note', 'grid', 'vision'], []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const processRef = useRef<HTMLDivElement | null>(null);
  const gotoRef = useRef<HTMLDivElement | null>(null);
  const conditionalRef = useRef<HTMLDivElement | null>(null);

  const kindButtonById = useRef<Record<DemoKind, HTMLButtonElement | null>>({
    diagram: null,
    note: null,
    grid: null,
    vision: null,
  });

  const [activeKind, setActiveKind] = useState<DemoKind>('diagram');
  const [didInteract, setDidInteract] = useState(false);
  const [pulseTick, setPulseTick] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [paths, setPaths] = useState<{ p1: string; p2: string }>({ p1: '', p2: '' });
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;

    setSize({ w, h });

    const btn = kindButtonById.current[activeKind];
    if (btn) {
      const br = btn.getBoundingClientRect();
      const cx = br.left - containerRect.left + br.width * 0.72;
      const cy = br.top - containerRect.top + br.height * 1.15;
      setCursor({ x: cx, y: cy, visible: true });
    } else {
      setCursor((prev) => ({ ...prev, visible: false }));
    }

    if (activeKind !== 'diagram') return;

    const processEl = processRef.current;
    const gotoEl = gotoRef.current;
    const condEl = conditionalRef.current;
    if (!processEl || !gotoEl || !condEl) return;

    const pr = processEl.getBoundingClientRect();
    const gr = gotoEl.getBoundingClientRect();
    const cr = condEl.getBoundingClientRect();

    const a1 = toLocalPoint(containerRect, pr, rightMid(pr));
    const b1 = toLocalPoint(containerRect, gr, leftMid(gr));
    const a2 = toLocalPoint(containerRect, gr, rightMid(gr));
    const b2 = toLocalPoint(containerRect, cr, leftMid(cr));

    setPaths({ p1: cubicBetween(a1, b1), p2: cubicBetween(a2, b2) });
  }, [activeKind]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(Boolean(m.matches));
    sync();
    m.addEventListener?.('change', sync);
    return () => m.removeEventListener?.('change', sync);
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };

    schedule();
    window.addEventListener('resize', schedule);

    const container = containerRef.current;
    const ro = container ? new ResizeObserver(schedule) : null;
    if (container && ro) ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      if (ro) ro.disconnect();
    };
  }, [recompute]);

  useEffect(() => {
    // Recompute anchor points immediately when switching preview kind.
    // (Keeps connectors/cursor aligned even when fonts load after mount.)
    recompute();
  }, [activeKind, recompute]);

  useEffect(() => {
    if (didInteract || reduceMotion) return;
    const t = window.setInterval(() => {
      setPulseTick((n) => n + 1);
      setActiveKind((cur) => {
        const idx = order.indexOf(cur);
        return order[(idx + 1) % order.length] || 'diagram';
      });
    }, 3200);
    return () => window.clearInterval(t);
  }, [didInteract, order, reduceMotion]);

  const viewBox = useMemo(() => `0 0 ${Math.max(1, size.w)} ${Math.max(1, size.h)}`, [size]);

  return (
    <div className="mac-window overflow-hidden">
      <div className="mac-titlebar">
        <div className="mac-title">workspace_preview.exe</div>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-video overflow-hidden mac-canvas-bg"
        style={{ '--canvas-zoom': 1 } as CSSProperties}
      >
        <div className="absolute left-4 top-3 z-10">
          <div className="inline-flex items-center gap-1 mac-double-outline bg-white px-2 py-1">
            <button
              ref={(el) => {
                kindButtonById.current.diagram = el;
              }}
              type="button"
              className={`mac-btn mac-btn--icon-sm ${activeKind === 'diagram' ? 'mac-btn--primary' : ''}`}
              aria-label="Diagram file"
              title="Diagram"
              onClick={() => {
                setDidInteract(true);
                setPulseTick((n) => n + 1);
                setActiveKind('diagram');
              }}
            >
              <Network size={16} />
            </button>
            <button
              ref={(el) => {
                kindButtonById.current.note = el;
              }}
              type="button"
              className={`mac-btn mac-btn--icon-sm ${activeKind === 'note' ? 'mac-btn--primary' : ''}`}
              aria-label="Note file"
              title="Note"
              onClick={() => {
                setDidInteract(true);
                setPulseTick((n) => n + 1);
                setActiveKind('note');
              }}
            >
              <FileText size={16} />
            </button>
            <button
              ref={(el) => {
                kindButtonById.current.grid = el;
              }}
              type="button"
              className={`mac-btn mac-btn--icon-sm ${activeKind === 'grid' ? 'mac-btn--primary' : ''}`}
              aria-label="Grid file"
              title="Grid"
              onClick={() => {
                setDidInteract(true);
                setPulseTick((n) => n + 1);
                setActiveKind('grid');
              }}
            >
              <Table2 size={16} />
            </button>
            <button
              ref={(el) => {
                kindButtonById.current.vision = el;
              }}
              type="button"
              className={`mac-btn mac-btn--icon-sm ${activeKind === 'vision' ? 'mac-btn--primary' : ''}`}
              aria-label="Vision file"
              title="Vision"
              onClick={() => {
                setDidInteract(true);
                setPulseTick((n) => n + 1);
                setActiveKind('vision');
              }}
            >
              <Eye size={16} />
            </button>
          </div>
        </div>

        {cursor.visible && !reduceMotion && activeKind === 'diagram' ? (
          <div
            className="pointer-events-none absolute z-20 transition-[left,top,opacity] duration-500 ease-out"
            style={{ left: cursor.x, top: cursor.y, opacity: 0.95 }}
          >
            <div className="relative">
              <div key={pulseTick} className="absolute -inset-2 rounded-full border border-black/10 animate-ping" />
              <div className="w-3 h-3 border border-black bg-white mac-shadow-hard" />
            </div>
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] mac-double-outline bg-white">
              <span className="font-semibold">USER</span>
            </div>
          </div>
        ) : null}

        {activeKind === 'diagram' ? (
          <>
            <svg
              className="pointer-events-none absolute inset-0"
              viewBox={viewBox}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={paths.p1}
                fill="none"
                stroke="rgba(24, 27, 32, 0.34)"
                strokeWidth={6}
                strokeLinecap="round"
              />
              <path
                d={paths.p2}
                fill="none"
                stroke="rgba(24, 27, 32, 0.28)"
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray="16 16"
              />
            </svg>

            <div ref={processRef} className="absolute left-[10%] top-[24%] w-[240px]">
              <div className="dg-node-card dg-node-card--active">
                <div className="dg-node-card__meta-row">
                  <span className="dg-node-card__meta-label">Process</span>
                  <span className="dg-node-card__meta-id">L:97</span>
                </div>
                <div className="dg-node-card__title">Define onboarding steps</div>
                <div className="dg-node-card__placeholder" />
              </div>
            </div>

            <div ref={gotoRef} className="absolute left-[44%] top-[18%] w-[220px]">
              <div className="dg-node-card dg-node-card--idle">
                <div className="dg-node-card__meta-row">
                  <span className="dg-node-card__meta-label">Go to</span>
                  <span className="dg-node-card__meta-id">L:96</span>
                </div>
                <div className="dg-node-card__title">Link decision note</div>
                <div className="dg-node-card__placeholder" />
              </div>
            </div>

            <div ref={conditionalRef} className="absolute left-[68%] top-[34%] h-[148px] w-[148px]">
              <svg className="mac-diamond-outline-svg absolute inset-0 z-[0]" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon points="50,0 100,50 50,100 0,50" fill="#171a1f" shapeRendering="crispEdges" />
                <polygon
                  points="50,1.5 98.5,50 50,98.5 1.5,50"
                  fill="none"
                  stroke="#171a1f"
                  strokeWidth="1.5"
                  strokeLinejoin="miter"
                  shapeRendering="crispEdges"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center p-5 text-center">
                <div className="text-[12px] font-semibold leading-tight text-white">Ready to proceed?</div>
              </div>
            </div>
          </>
        ) : activeKind === 'note' ? (
          <div className="absolute inset-0 bg-[#eef0f3]">
            <div className="absolute inset-x-0 bottom-0 top-[54px]">
              <aside className="absolute inset-y-0 left-0 w-[200px] border-r border-black/15 bg-[#f6f7f9]">
                <div className="border-b border-black/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.08em] text-[#607084]">Outline</div>
                <div className="space-y-2 px-3 py-3 text-xs text-neutral-700">
                  <div className="font-semibold">Untitled</div>
                  <div className="pl-2">Sections</div>
                  <div className="pl-2">Embeds</div>
                </div>
              </aside>
              <div className="absolute inset-y-0 left-[200px] right-0">
                <div className="absolute left-[16%] top-[58%] w-[72%] -translate-y-1/2">
                  <div className="rounded-sm border border-black/10 bg-[#e8ebf0] p-3 font-mono text-[10px] leading-5 text-neutral-600">
                    {'{'}
                    <br />
                    {'  "kind": "note",'}
                    <br />
                    {'  "version": 1'}
                    <br />
                    {'}'}
                  </div>
                  <h3 className="mt-5 text-[44px] font-bold tracking-tight text-[#171a1f]">Untitled</h3>
                  <p className="mt-2 text-[33px] leading-[1.15] text-[#171a1f]">Write here.</p>
                  <h4 className="mt-4 text-[24px] font-bold text-[#171a1f]">Sections</h4>
                  <p className="mt-1 text-[16px] text-neutral-700">Use headings to structure your brief and keep everyone aligned.</p>
                </div>
              </div>
            </div>
          </div>
        ) : activeKind === 'grid' ? (
          <div className="absolute inset-0 bg-[#eef0f3]">
            <div className="absolute inset-x-0 bottom-0 top-[54px]">
              <aside className="absolute inset-y-0 left-0 w-[168px] border-r border-black/15 bg-[#f6f7f9]">
                <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.08em] text-[#607084]">Sheets</div>
                <div className="border-t border-black/10 px-2 py-3">
                  <div className="rounded-md border border-[#d64a68]/60 bg-[#ecd7dc] px-3 py-3 text-xs font-semibold text-neutral-900">
                    Sheet 1
                  </div>
                </div>
              </aside>
              <div className="absolute inset-y-0 left-[168px] right-0">
                <div className="flex h-[34px] items-center gap-2 border-b border-black/15 bg-[#f7f8fa] px-3">
                  <span className="rounded-md border border-black/20 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-900">Sheet 1</span>
                  <span className="rounded-md bg-[#e11d48] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">Spreadsheet</span>
                  <span className="rounded-md border border-black/20 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-600">Database</span>
                </div>
                <div className="flex h-[34px] items-center gap-2 border-b border-black/10 bg-white px-3 text-[10px] font-mono uppercase tracking-[0.08em] text-neutral-600">
                  {['+ Row', '+ Col', '+ Card', 'Merge'].map((a) => (
                    <span key={a} className="rounded-md border border-black/20 bg-[#f7f8fa] px-2 py-1">{a}</span>
                  ))}
                </div>
                <div className="overflow-hidden bg-white">
                  <table className="w-full table-fixed text-[10px]">
                    <thead>
                      <tr className="border-b border-black/10 bg-[#f8f9fb] text-neutral-700">
                        <th className="w-8 border-r border-black/10 py-1" />
                        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map((c) => (
                          <th key={c} className="border-r border-black/10 py-1 font-semibold">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 16 }).map((_, i) => (
                        <tr key={i} className="border-b border-black/5">
                          <td className="border-r border-black/10 bg-[#f8f9fb] text-center font-semibold text-neutral-600">{i + 1}</td>
                          {Array.from({ length: 12 }).map((__, j) => (
                            <td key={j} className="h-7 border-r border-black/5">
                              {i === 0 && j === 0 ? <div className="mx-auto h-5 w-16 rounded border border-black/25 bg-white" /> : null}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : activeKind === 'vision' ? (
          <div className="absolute inset-0 bg-[#ececef]">
            <div className="absolute inset-x-0 bottom-0 top-[54px]">
              <div className="absolute inset-4 rounded-2xl border border-black/15 bg-[#f7f8fb]">
                <svg className="absolute inset-0" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M162 148 C 260 148, 312 220, 410 220" fill="none" stroke="rgba(23,26,31,0.28)" strokeWidth="3" />
                  <path d="M410 220 C 530 220, 560 318, 680 318" fill="none" stroke="rgba(23,26,31,0.18)" strokeWidth="3" strokeDasharray="10 10" />
                </svg>

                <div className="absolute left-7 top-7 flex items-center gap-2">
                  <button type="button" className="rounded-md bg-[#e11d48] px-3 py-2 text-[11px] font-semibold text-white">Primary Button</button>
                  <button type="button" className="rounded-md border border-black/20 bg-white px-3 py-2 text-[11px] font-semibold text-neutral-800">Secondary</button>
                </div>

                <div className="absolute left-8 top-24 w-[260px] rounded-xl border border-black/15 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500">UI CARD</div>
                  <div className="mt-2 text-sm font-semibold text-neutral-900">Signup module</div>
                  <div className="mt-1 text-xs text-neutral-600">Drop components on canvas and align flows visually.</div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-black/15 bg-[#eef0f4] px-2 py-1 text-[11px] text-neutral-700">
                    <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                    Ready state
                  </div>
                </div>

                <div className="absolute right-20 top-20 h-24 w-24 rounded-2xl bg-[#2563eb]" />
                <div className="absolute right-40 top-44 h-16 w-16 rounded-full bg-[#22c55e]" />
                <div className="absolute right-64 top-24 h-16 w-16 rotate-45 rounded-md bg-[#f59e0b]" />
                <div className="absolute right-28 top-52 rounded-md border border-black/20 bg-white px-3 py-2 text-[11px] font-semibold text-neutral-800">CTA / Buy now</div>
              </div>
            </div>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-black/15 bg-white px-3 py-2 shadow-sm">
              {['◥', '✋', '✎', '↗', 'T', '▢', '⛶', '?'].map((tool) => (
                <span
                  key={tool}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs ${
                    tool === '◥' ? 'border-[#2563eb]/30 bg-[#2563eb] text-white' : 'border-black/15 bg-white text-neutral-700'
                  }`}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
