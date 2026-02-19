'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { X } from 'lucide-react';
import { downloadKgVectors, type KgEdgeRecord, type KgEntityRecord } from '@/lib/kg-vector-export';

type ParsedKg = {
  entities: KgEntityRecord[];
  edges: KgEdgeRecord[];
  parseErrors: number;
};

function parseGraphJsonl(graphJsonl: string): ParsedKg {
  const entities: KgEntityRecord[] = [];
  const edges: KgEdgeRecord[] = [];
  let parseErrors = 0;
  for (const rawLine of String(graphJsonl || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as any;
      if (obj?.type === 'entity' && typeof obj?.id === 'string') entities.push(obj as KgEntityRecord);
      else if (obj?.type === 'edge' && typeof obj?.id === 'string') edges.push(obj as KgEdgeRecord);
    } catch {
      parseErrors += 1;
    }
  }
  return { entities, edges, parseErrors };
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function cleanNexusNodeLine(s: string): string {
  // Best-effort cleanup for Nexus node lines:
  // - strip inline HTML comments like <!-- tags:... --> / <!-- ann:... -->
  // - strip known structural markers (#flow#, #flowtab#, #common#)
  // Keep everything else as-is (don't aggressively delete hashtags).
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+#(?:flow|flowtab|common)#\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickLabel(ent: KgEntityRecord): string {
  const anyEnt = ent as any;
  const content = typeof anyEnt?.content === 'string' ? anyEnt.content : '';
  if (content.trim()) {
    const cleaned = cleanNexusNodeLine(content);
    if (cleaned) return cleaned;
  }
  const name = typeof anyEnt?.name === 'string' ? anyEnt.name : '';
  if (name.trim()) return name.trim();
  const title = typeof anyEnt?.title === 'string' ? anyEnt.title : '';
  if (title.trim()) return title.trim();
  const text = typeof anyEnt?.text === 'string' ? anyEnt.text : '';
  if (text.trim()) return text.trim();
  const label = typeof anyEnt?.label === 'string' ? anyEnt.label : '';
  if (label.trim()) return label.trim();
  const propsTitle = typeof anyEnt?.props?.title === 'string' ? anyEnt.props.title : '';
  if (propsTitle.trim()) return propsTitle.trim();
  const propsText = typeof anyEnt?.props?.text === 'string' ? anyEnt.props.text : '';
  if (propsText.trim()) return propsText.trim();
  const shapeType = typeof anyEnt?.shapeType === 'string' ? anyEnt.shapeType : '';
  if (shapeType.trim()) return `(${shapeType.trim()})`;
  const id = String(ent.id || '');
  return id.length > 48 ? `${id.slice(0, 18)}…${id.slice(-18)}` : id;
}

type NodeState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function SemanticKgViewerModal({
  open,
  onClose,
  exportResult,
  basename,
}: {
  open: boolean;
  onClose: () => void;
  exportResult: { graphJsonl: string; embeddingsJsonl: string; stats?: { files: number; entities: number; edges: number; chunks: number } } | null;
  basename: string;
}) {
  const parsed = useMemo(() => parseGraphJsonl(exportResult?.graphJsonl || ''), [exportResult?.graphJsonl]);

  const allEntityTypes = useMemo(() => {
    const set = new Set<string>();
    parsed.entities.forEach((e) => set.add(String(e.entityType || 'unknown')));
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [parsed.entities]);

  const allEdgeTypes = useMemo(() => {
    const set = new Set<string>();
    parsed.edges.forEach((e) => set.add(String(e.edgeType || 'unknown')));
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [parsed.edges]);

  const [enabledEntityTypes, setEnabledEntityTypes] = useState<Set<string>>(new Set());
  const [enabledEdgeTypes, setEnabledEdgeTypes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // View transform (pan/zoom) stored in refs for smooth interaction.
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const dragRef = useRef<
    | null
    | { kind: 'pan'; startX: number; startY: number; startTx: number; startTy: number }
    | { kind: 'node'; id: string }
  >(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeStateRef = useRef<Map<string, NodeState>>(new Map());
  const latestVisibleRef = useRef<{
    visibleNodeIds: Set<string>;
    visibleEdges: KgEdgeRecord[];
    neighborSet: Set<string> | null;
  }>({ visibleNodeIds: new Set(), visibleEdges: [], neighborSet: null });
  const renderScheduledRef = useRef(false);
  const renderRef = useRef<(() => void) | null>(null);

  // Initialize filters to "all" when opening / when types change.
  useEffect(() => {
    if (!open) return;
    setEnabledEntityTypes(new Set(allEntityTypes));
    setEnabledEdgeTypes(new Set(allEdgeTypes));
  }, [open, allEntityTypes.join('|'), allEdgeTypes.join('|')]);

  // Clear selection if it becomes invisible.
  useEffect(() => {
    if (!selectedNodeId) return;
    const node = parsed.entities.find((e) => e.id === selectedNodeId);
    if (!node) setSelectedNodeId(null);
  }, [parsed.entities, selectedNodeId]);

  const {
    visibleEntities,
    visibleEdges,
    visibleNodeIds,
    entityLabelById,
    entityTypeById,
    degreeById,
    neighborSet,
  } = useMemo(() => {
    const enabledEnt = enabledEntityTypes;
    const enabledEdg = enabledEdgeTypes;

    const ent = parsed.entities.filter((e) => enabledEnt.has(String(e.entityType || 'unknown')));
    const entSet = new Set(ent.map((e) => e.id));

    const edg = parsed.edges.filter(
      (e) => enabledEdg.has(String(e.edgeType || 'unknown')) && entSet.has(e.src) && entSet.has(e.dst),
    );

    // If edge filtering is active (not all selected), hide disconnected nodes.
    const edgeFilterActive = enabledEdg.size !== allEdgeTypes.length;
    const connected = new Set<string>();
    if (edgeFilterActive) {
      edg.forEach((e) => {
        connected.add(e.src);
        connected.add(e.dst);
      });
    }

    const finalEnt = edgeFilterActive ? ent.filter((e) => connected.has(e.id)) : ent;
    const finalEntSet = new Set(finalEnt.map((e) => e.id));
    const finalEdg = edg.filter((e) => finalEntSet.has(e.src) && finalEntSet.has(e.dst));

    const labelById = new Map<string, string>();
    const typeById = new Map<string, string>();
    for (const e of parsed.entities) {
      labelById.set(e.id, pickLabel(e));
      typeById.set(e.id, String(e.entityType || 'unknown'));
    }

    const degree = new Map<string, number>();
    for (const e of finalEdg) {
      degree.set(e.src, (degree.get(e.src) || 0) + 1);
      degree.set(e.dst, (degree.get(e.dst) || 0) + 1);
    }

    const nbr = (() => {
      if (!selectedNodeId) return null;
      if (!finalEntSet.has(selectedNodeId)) return null;
      const out = new Set<string>();
      out.add(selectedNodeId);
      for (const e of finalEdg) {
        if (e.src === selectedNodeId) out.add(e.dst);
        else if (e.dst === selectedNodeId) out.add(e.src);
      }
      return out;
    })();

    return {
      visibleEntities: finalEnt,
      visibleEdges: finalEdg,
      visibleNodeIds: finalEntSet,
      entityLabelById: labelById,
      entityTypeById: typeById,
      degreeById: degree,
      neighborSet: nbr,
    };
  }, [
    allEdgeTypes.length,
    allEntityTypes,
    enabledEdgeTypes,
    enabledEntityTypes,
    parsed.edges,
    parsed.entities,
    selectedNodeId,
  ]);

  // Keep latest visibility for event handlers / renderer loop.
  useEffect(() => {
    latestVisibleRef.current = { visibleNodeIds, visibleEdges, neighborSet };
  }, [visibleNodeIds, visibleEdges, neighborSet]);

  const requestRender = () => {
    if (renderScheduledRef.current) return;
    renderScheduledRef.current = true;
    requestAnimationFrame(() => {
      renderScheduledRef.current = false;
      renderRef.current?.();
    });
  };

  // Initialize node positions (stable across filter toggles).
  useEffect(() => {
    if (!open) return;
    const map = nodeStateRef.current;
    // Seed any new nodes onto a loose circle.
    const existing = map.size;
    const r = 220;
    visibleEntities.forEach((e, idx) => {
      if (map.has(e.id)) return;
      const a = ((existing + idx) / Math.max(1, parsed.entities.length)) * Math.PI * 2;
      map.set(e.id, { id: e.id, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, pinned: false });
    });
    requestRender();
  }, [open, parsed.entities.length, visibleEntities]);

  // Run a lightweight force layout whenever the visible graph changes.
  useEffect(() => {
    if (!open) return;
    if (!canvasRef.current) return;

    let raf = 0;
    let last = performance.now();
    let alpha = 1.0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 900;
      const h = parent?.clientHeight || 600;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { tx, ty, scale } = viewRef.current;
      ctx.translate(w / 2 + tx, h / 2 + ty);
      ctx.scale(scale, scale);

      const vis = latestVisibleRef.current;
      const map = nodeStateRef.current;

      // Edges.
      for (const e of vis.visibleEdges) {
        const a = map.get(e.src);
        const b = map.get(e.dst);
        if (!a || !b) continue;
        const faded = vis.neighborSet ? !(vis.neighborSet.has(e.src) && vis.neighborSet.has(e.dst)) : false;
        ctx.globalAlpha = faded ? 0.08 : 0.35;
        ctx.strokeStyle = `hsl(${hashHue(String(e.edgeType || 'edge'))}, 70%, 45%)`;
        ctx.lineWidth = faded ? 1 : 1.35;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Nodes.
      for (const id of vis.visibleNodeIds) {
        const n = map.get(id);
        if (!n) continue;
        const t = entityTypeById.get(id) || 'unknown';
        const deg = degreeById.get(id) || 0;
        const r = clamp(6 + Math.sqrt(deg) * 1.9, 6, 16);
        const faded = vis.neighborSet ? !vis.neighborSet.has(id) : false;

        ctx.globalAlpha = faded ? 0.12 : 1.0;
        ctx.fillStyle = `hsl(${hashHue(t)}, 70%, 50%)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = faded ? 0.12 : 0.9;
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label (only when not too zoomed out).
        if (scale > 0.55) {
          const label = entityLabelById.get(id) || id;
          ctx.globalAlpha = faded ? 0.10 : 0.85;
          ctx.fillStyle = 'rgba(20,20,20,0.9)';
          ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
          ctx.textBaseline = 'middle';
          ctx.fillText(label.length > 42 ? `${label.slice(0, 40)}…` : label, n.x + r + 6, n.y);
        }
      }

      ctx.globalAlpha = 1;
    };

    renderRef.current = render;
    requestRender();

    const tick = (now: number) => {
      const dt = clamp((now - last) / 1000, 0.008, 0.05);
      last = now;
      alpha *= 0.985;

      const vis = latestVisibleRef.current;
      const nodesArr: NodeState[] = [];
      const map = nodeStateRef.current;
      for (const id of vis.visibleNodeIds) {
        const st = map.get(id);
        if (st) nodesArr.push(st);
      }

      // Forces tuned for "web-like" layouts (small/medium graphs).
      // For large graphs, reduce repulsion cost to avoid "freezing".
      const repulseK = nodesArr.length > 650 ? 0 : 950 * alpha;
      const springK = 0.09 * alpha;
      const springLen = 90;
      const centerK = 0.13 * alpha;
      const damping = 0.86;

      // Pairwise repulsion (O(n^2); acceptable for typical project graphs).
      if (repulseK > 0) {
        for (let i = 0; i < nodesArr.length; i += 1) {
          const a = nodesArr[i]!;
          if (a.pinned) continue;
          for (let j = i + 1; j < nodesArr.length; j += 1) {
            const b = nodesArr[j]!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy + 0.001;
            const f = repulseK / d2;
            const fx = dx * f;
            const fy = dy * f;
            if (!a.pinned) {
              a.vx += fx * dt;
              a.vy += fy * dt;
            }
            if (!b.pinned) {
              b.vx -= fx * dt;
              b.vy -= fy * dt;
            }
          }
        }
      }

      // Spring forces along edges.
      for (const e of vis.visibleEdges) {
        const a = map.get(e.src);
        const b = map.get(e.dst);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const diff = dist - springLen;
        const f = springK * diff;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        if (!a.pinned) {
          a.vx += fx * dt;
          a.vy += fy * dt;
        }
        if (!b.pinned) {
          b.vx -= fx * dt;
          b.vy -= fy * dt;
        }
      }

      // Pull toward center.
      for (const n of nodesArr) {
        if (n.pinned) continue;
        n.vx += (-n.x * centerK) * dt;
        n.vy += (-n.y * centerK) * dt;
      }

      // Integrate.
      for (const n of nodesArr) {
        if (!n.pinned) {
          n.vx *= damping;
          n.vy *= damping;
          n.x += n.vx * (60 * dt);
          n.y += n.vy * (60 * dt);
        }
      }

      requestRender();
      if (alpha > 0.03) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, visibleEdges, visibleNodeIds, entityTypeById, degreeById, entityLabelById]);

  // Re-render on selection/filter-only changes (simulation might have stopped).
  useEffect(() => {
    if (!open) return;
    requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedNodeId, enabledEntityTypes, enabledEdgeTypes]);

  // Re-render on resize.
  useEffect(() => {
    if (!open) return;
    const onResize = () => requestRender();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const parent = canvas.parentElement;
    const w = parent?.clientWidth || rect.width;
    const h = parent?.clientHeight || rect.height;

    const { tx, ty, scale } = viewRef.current;
    const x = (px - w / 2 - tx) / scale;
    const y = (py - h / 2 - ty) / scale;

    // Hit test nodes.
    const vis = latestVisibleRef.current;
    const map = nodeStateRef.current;
    let hit: { id: string; dist2: number } | null = null;
    for (const id of vis.visibleNodeIds) {
      const n = map.get(id);
      if (!n) continue;
      const t = entityTypeById.get(id) || 'unknown';
      const deg = degreeById.get(id) || 0;
      const r = clamp(6 + Math.sqrt(deg) * 1.9, 6, 16) + 4;
      const dx = x - n.x;
      const dy = y - n.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r * r) {
        if (!hit || d2 < hit.dist2) hit = { id, dist2: d2 };
      }
    }

    if (hit) {
      setSelectedNodeId(hit.id);
      const st = nodeStateRef.current.get(hit.id);
      if (st) st.pinned = true;
      dragRef.current = { kind: 'node', id: hit.id };
      requestRender();
      return;
    }

    setSelectedNodeId(null);
    dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, startTx: viewRef.current.tx, startTy: viewRef.current.ty };
    requestRender();
  };

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!dragRef.current) return;

    const drag = dragRef.current;
    if (drag.kind === 'pan') {
      viewRef.current.tx = drag.startTx + (e.clientX - drag.startX);
      viewRef.current.ty = drag.startTy + (e.clientY - drag.startY);
      requestRender();
      return;
    }

    if (drag.kind === 'node') {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const parent = canvas.parentElement;
      const w = parent?.clientWidth || rect.width;
      const h = parent?.clientHeight || rect.height;

      const { tx, ty, scale } = viewRef.current;
      const x = (px - w / 2 - tx) / scale;
      const y = (py - h / 2 - ty) / scale;
      const st = nodeStateRef.current.get(drag.id);
      if (st) {
        st.x = x;
        st.y = y;
        st.vx = 0;
        st.vy = 0;
        requestRender();
      }
    }
  };

  const onCanvasPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && drag.kind === 'node') {
      const st = nodeStateRef.current.get(drag.id);
      if (st) st.pinned = false;
    }
    requestRender();
  };

  const onCanvasWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.08 : 0.93;
    viewRef.current.scale = clamp(viewRef.current.scale * factor, 0.15, 2.5);
    requestRender();
  };

  const resetView = () => {
    viewRef.current = { tx: 0, ty: 0, scale: 1 };
    requestRender();
  };

  const fitView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || 900;
    const h = parent?.clientHeight || 600;
    const vis = latestVisibleRef.current;
    const map = nodeStateRef.current;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    for (const id of vis.visibleNodeIds) {
      const n = map.get(id);
      if (!n) continue;
      count += 1;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    if (!count || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      resetView();
      return;
    }
    const pad = 60;
    const gw = Math.max(1, maxX - minX);
    const gh = Math.max(1, maxY - minY);
    const scale = clamp(Math.min((w - pad) / gw, (h - pad) / gh), 0.15, 2.5);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Center world center to screen center: tx = -cx*scale, but note we apply translate AFTER setting tx,ty in screen space.
    viewRef.current.scale = scale;
    viewRef.current.tx = -cx * scale;
    viewRef.current.ty = -cy * scale;
    requestRender();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[1200px] h-[85vh] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl flex flex-col">
        <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">Semantic KG Viewer</div>
            <div className="text-[11px] text-gray-600 truncate">
              {exportResult?.stats
                ? `${exportResult.stats.entities} entities • ${exportResult.stats.edges} edges • ${exportResult.stats.files} files`
                : `${parsed.entities.length} entities • ${parsed.edges.length} edges`}
              {parsed.parseErrors ? ` • ${parsed.parseErrors} parse errors` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className="mac-btn h-8" onClick={fitView} title="Fit graph in view">
              Fit
            </button>
            <button type="button" className="mac-btn h-8" onClick={resetView} title="Reset pan + zoom">
              Reset
            </button>
            <button
              type="button"
              className="mac-btn h-8"
              onClick={() => {
                if (!exportResult) return;
                downloadKgVectors({ graphJsonl: exportResult.graphJsonl, embeddingsJsonl: exportResult.embeddingsJsonl, basename });
              }}
              disabled={!exportResult}
              title="Download .graph.jsonl + .embeddings.jsonl"
            >
              Download export
            </button>
            <button type="button" className="mac-btn h-8 flex items-center gap-1" onClick={onClose} title="Close">
              <X size={14} /> Close
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="w-[320px] shrink-0 border-r border-gray-200 p-3 overflow-y-auto">
            <div className="text-[11px] font-semibold text-gray-800 mb-2">Filters</div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-medium text-gray-700">Node types</div>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                  onClick={() => setEnabledEntityTypes(new Set(allEntityTypes))}
                >
                  All
                </button>
              </div>
              <div className="grid gap-1">
                {allEntityTypes.map((t) => {
                  const hue = hashHue(t);
                  const checked = enabledEntityTypes.has(t);
                  return (
                    <label key={t} className="flex items-center justify-between gap-2 text-[11px] text-gray-800">
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedNodeId(null);
                            setEnabledEntityTypes((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(t);
                              else next.delete(t);
                              return next;
                            });
                          }}
                        />
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `hsl(${hue}, 70%, 50%)` }} />
                        <span className="truncate">{t}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-medium text-gray-700">Edge types</div>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                  onClick={() => {
                    setSelectedNodeId(null);
                    setEnabledEdgeTypes(new Set(allEdgeTypes));
                  }}
                >
                  All
                </button>
              </div>
              <div className="grid gap-1">
                {allEdgeTypes.map((t) => {
                  const checked = enabledEdgeTypes.has(t);
                  return (
                    <label key={t} className="flex items-center justify-between gap-2 text-[11px] text-gray-800">
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedNodeId(null);
                            setEnabledEdgeTypes((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(t);
                              else next.delete(t);
                              return next;
                            });
                          }}
                        />
                        <span className="truncate">{t}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-gray-600">
                Tip: filtering edges also hides nodes that become disconnected from the remaining edges.
              </div>
            </div>

            <div className="mac-double-outline p-2 text-[11px] text-gray-700">
              <div className="font-medium mb-1">Interaction</div>
              <div>- Click a node to fade non-neighbors.</div>
              <div>- Drag a node to reposition.</div>
              <div>- Drag background to pan, wheel to zoom.</div>
              <div>- Click empty space to clear selection.</div>
            </div>
          </div>

          <div className="flex-1 min-w-0 min-h-0 relative">
            <canvas
              ref={canvasRef}
              className="absolute inset-0"
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onWheel={onCanvasWheel}
            />

            {visibleEntities.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600">
                No nodes match the current filters.
              </div>
            ) : null}

            {selectedNodeId ? (
              <div className="absolute left-3 bottom-3 mac-window mac-double-outline bg-white px-3 py-2 text-[11px] max-w-[520px]">
                <div className="font-semibold text-gray-900 truncate">{entityLabelById.get(selectedNodeId) || selectedNodeId}</div>
                <div className="text-gray-700 truncate">Entity: {entityTypeById.get(selectedNodeId) || 'unknown'}</div>
                <div className="text-gray-600 truncate">ID: {selectedNodeId}</div>
                <div className="text-gray-600 truncate">
                  Direct connections: {neighborSet ? Math.max(0, neighborSet.size - 1) : 0}
                </div>
                {(() => {
                  const ent = parsed.entities.find((e) => e.id === selectedNodeId) as any;
                  if (!ent) return null;
                  const rows: Array<{ k: string; v: string }> = [];
                  if (typeof ent.uiType === 'string' && ent.uiType.trim()) rows.push({ k: 'UI type', v: ent.uiType });
                  if (typeof ent.expid === 'number') rows.push({ k: 'expid', v: String(ent.expid) });
                  if (typeof ent.runningNumber === 'number') rows.push({ k: 'running #', v: String(ent.runningNumber) });
                  if (typeof ent.isFlowNode === 'boolean') rows.push({ k: 'flow', v: ent.isFlowNode ? 'yes' : 'no' });
                  if (typeof ent.flowNodeType === 'string' && ent.flowNodeType.trim()) rows.push({ k: 'flow node type', v: ent.flowNodeType });
                  if (typeof ent.uiTabsCount === 'number') rows.push({ k: 'tabs', v: String(ent.uiTabsCount) });
                  if (typeof ent.uiSectionsCount === 'number') rows.push({ k: 'sections', v: String(ent.uiSectionsCount) });
                  if (Array.isArray(ent.dataObjectAttributeValues) && ent.dataObjectAttributeValues.length) {
                    const preview = ent.dataObjectAttributeValues
                      .slice(0, 3)
                      .map((a: any) => {
                        const n = typeof a?.name === 'string' ? a.name : a?.id;
                        const vals = a?.values;
                        if (Array.isArray(vals) && vals.length) return `${n}=[${vals.slice(0, 3).join(', ')}${vals.length > 3 ? ', …' : ''}]`;
                        if (typeof vals === 'string' && vals.trim()) return `${n}=${vals}`;
                        if (a?.sample != null) return `${n} (sample)`;
                        return String(n || 'attr');
                      })
                      .join(' • ');
                    rows.push({ k: 'attrs', v: preview });
                  }
                  if (!rows.length) return null;
                  return (
                    <div className="mt-1 grid gap-0.5">
                      {rows.slice(0, 6).map((r) => (
                        <div key={r.k} className="text-gray-600 truncate">
                          {r.k}: {r.v}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

