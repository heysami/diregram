'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Eye, FileText, Network, Table2, TestTube } from 'lucide-react';

type Size = { w: number; h: number };
type Point = { x: number; y: number };

type DemoKind = 'diagram' | 'note' | 'grid' | 'vision' | 'template' | 'test';

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
  const order: DemoKind[] = useMemo(() => ['diagram', 'note', 'grid', 'vision', 'template', 'test'], []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const processRef = useRef<HTMLDivElement | null>(null);
  const gotoRef = useRef<HTMLDivElement | null>(null);
  const conditionalRef = useRef<HTMLDivElement | null>(null);

  const kindButtonById = useRef<Record<DemoKind, HTMLButtonElement | null>>({
    diagram: null,
    note: null,
    grid: null,
    vision: null,
    template: null,
    test: null,
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
        <div className="mac-title">demo_preview.exe</div>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-video overflow-hidden mac-canvas-bg"
        style={{ '--canvas-zoom': 1 } as any}
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
            <button
              ref={(el) => {
                kindButtonById.current.template = el;
              }}
              type="button"
              className={`mac-btn mac-btn--icon-sm ${activeKind === 'template' ? 'mac-btn--primary' : ''}`}
              aria-label="Template file"
              title="Template"
              onClick={() => {
                setDidInteract(true);
                setPulseTick((n) => n + 1);
                setActiveKind('template');
              }}
            >
              <Boxes size={16} />
            </button>
            <button
              ref={(el) => {
                kindButtonById.current.test = el;
              }}
              type="button"
              className={`mac-btn mac-btn--icon-sm ${activeKind === 'test' ? 'mac-btn--primary' : ''}`}
              aria-label="Test file"
              title="Test"
              onClick={() => {
                setDidInteract(true);
                setPulseTick((n) => n + 1);
                setActiveKind('test');
              }}
            >
              <TestTube size={16} />
            </button>
          </div>
        </div>

        {cursor.visible && !reduceMotion ? (
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
                <div className="dg-node-card__title">New account registration</div>
                <div className="dg-node-card__placeholder" />
              </div>
            </div>

            <div ref={gotoRef} className="absolute left-[44%] top-[18%] w-[220px]">
              <div className="dg-node-card dg-node-card--idle">
                <div className="dg-node-card__meta-row">
                  <span className="dg-node-card__meta-label">Go to</span>
                  <span className="dg-node-card__meta-id">L:96</span>
                </div>
                <div className="dg-node-card__title">Route</div>
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
                <div className="text-[12px] font-semibold leading-tight text-white">Conditional</div>
              </div>
            </div>
          </>
        ) : activeKind === 'note' ? (
          <div className="absolute left-[10%] top-[18%] w-[520px] max-w-[84%]">
            <div className="mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">Note</div>
              </div>
              <div className="bg-white">
                <div className="px-4 py-3 border-b border-black/10">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 font-mono">onboarding.md</div>
                  <div className="mt-1 text-sm font-semibold text-neutral-900">Registration flow notes</div>
                  <div className="mt-1 text-[12px] text-neutral-600 leading-relaxed">
                    Keep decisions next to the diagram. Link to nodes and routes so context stays attached.
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="text-xs text-neutral-700">
                    <span className="font-mono text-[11px] text-neutral-500">-</span> Validate email
                    <span className="font-mono text-[11px] text-neutral-500"> (L:97)</span>
                  </div>
                  <div className="text-xs text-neutral-700">
                    <span className="font-mono text-[11px] text-neutral-500">-</span> Route to
                    <span className="font-mono text-[11px] text-neutral-500"> /auth/register</span>
                  </div>
                  <div className="mac-double-outline bg-[#f0f0f0] p-3">
                    <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 font-mono">embed</div>
                    <div className="mt-2 inline-flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[#E11D48]" />
                      <div className="text-xs font-semibold text-neutral-800">Diagram: Registration flow</div>
                      <div className="text-[10px] font-mono text-neutral-500">ref: L:96</div>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-neutral-500 border-l border-black/10 pl-3">
                    {'// exportable, diffable, linkable'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeKind === 'grid' ? (
          <div className="absolute left-[8%] top-[18%] w-[680px] max-w-[90%]">
            <div className="mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">Grid</div>
              </div>
              <div className="bg-white p-3">
                <div className="mac-double-outline overflow-hidden bg-white">
                  <div className="px-3 py-2 border-b border-black/10 bg-[#eaedf1]">
                    <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-600 font-mono">api_spec.grid</div>
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-black/10 text-neutral-600 font-mono uppercase tracking-[0.08em] text-[10px]">
                        <th className="text-left px-3 py-2">Field</th>
                        <th className="text-left px-3 py-2">Type</th>
                        <th className="text-left px-3 py-2">Owner</th>
                        <th className="text-left px-3 py-2">Link</th>
                      </tr>
                    </thead>
                    <tbody className="text-neutral-800">
                      <tr className="border-b border-black/5">
                        <td className="px-3 py-2 font-semibold">email</td>
                        <td className="px-3 py-2 font-mono text-neutral-600">string</td>
                        <td className="px-3 py-2">Auth</td>
                        <td className="px-3 py-2 font-mono text-[#E11D48]">L:97</td>
                      </tr>
                      <tr className="border-b border-black/5">
                        <td className="px-3 py-2 font-semibold">password_hash</td>
                        <td className="px-3 py-2 font-mono text-neutral-600">string</td>
                        <td className="px-3 py-2">Auth</td>
                        <td className="px-3 py-2 font-mono text-neutral-500">do-6</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-semibold">status</td>
                        <td className="px-3 py-2 font-mono text-neutral-600">enum</td>
                        <td className="px-3 py-2">Product</td>
                        <td className="px-3 py-2 font-mono text-neutral-500">cond:reg</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-[11px] text-neutral-600 border-l border-black/10 pl-3">
                  Structured specs that link back to flows and data objects.
                </div>
              </div>
            </div>
          </div>
        ) : activeKind === 'vision' ? (
          <div className="absolute left-[10%] top-[18%] w-[560px] max-w-[88%]">
            <div className="mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">Vision</div>
              </div>
              <div className="p-5 mac-fill--hatch">
                <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-600 font-mono">Vision card</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                  Reduce onboarding time by 30%
                </div>
                <div className="mt-3 text-sm text-neutral-700 leading-relaxed border-l border-black/10 pl-3">
                  Align the team on the outcome, then link implementation details back to diagrams and specs.
                </div>
                <div className="mt-4 inline-flex items-center gap-2 mac-double-outline bg-white px-3 py-2">
                  <div className="h-2 w-2 rounded-full bg-[#E11D48]" />
                  <div className="text-[11px] font-mono text-neutral-700">linked: onboarding.md · api_spec.grid · L:97</div>
                </div>
              </div>
            </div>
          </div>
        ) : activeKind === 'template' ? (
          <div className="absolute left-[10%] top-[18%] w-[560px] max-w-[88%]">
            <div className="mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">Template</div>
              </div>
              <div className="bg-white p-4">
                <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 font-mono">template library</div>
                <div className="mt-3 space-y-2">
                  {[
                    { name: 'Signup flow', meta: 'diagram + flowtab', code: 'TPL-01' },
                    { name: 'Payment integration', meta: 'tech flow', code: 'TPL-02' },
                    { name: 'Data object spec', meta: 'grid + data graph', code: 'TPL-03' },
                  ].map((t) => (
                    <div key={t.code} className="mac-interactive-row px-3 py-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-neutral-900 truncate">{t.name}</div>
                        <div className="text-[11px] text-neutral-500 truncate">{t.meta}</div>
                      </div>
                      <div className="text-[10px] font-mono text-neutral-500">{t.code}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-neutral-600 border-l border-black/10 pl-3">
                  Standardize delivery so teams stay consistent across projects.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute left-[10%] top-[18%] w-[560px] max-w-[88%]">
            <div className="mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">Test</div>
              </div>
              <div className="bg-white p-4">
                <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 font-mono">tree tests</div>
                <div className="mt-2 text-sm font-semibold text-neutral-900">T1: Registration is valid</div>
                <div className="mt-3 space-y-2">
                  {[
                    { label: 'Process node exists', ref: 'L:97', status: 'PASS' },
                    { label: 'Go to route configured', ref: 'L:96', status: 'PASS' },
                    { label: 'Conditional paths covered', ref: 'cond:reg', status: 'TODO' },
                  ].map((s) => (
                    <div key={s.ref} className="mac-interactive-row px-3 py-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-neutral-900 truncate">{s.label}</div>
                        <div className="text-[11px] font-mono text-neutral-500 truncate">{s.ref}</div>
                      </div>
                      <div className={`text-[10px] font-mono ${s.status === 'PASS' ? 'text-neutral-800' : 'text-[#E11D48]'}`}>
                        {s.status}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-neutral-600 border-l border-black/10 pl-3">
                  Tests stay bound to the system map, so validations don’t drift.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
