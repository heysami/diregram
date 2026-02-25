'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { buildMergedDataObjectGraph, type DataObjectEdge, type DataObjectGraph, type DataObjectNode } from '@/lib/data-object-graph';
import { createDataObject, deleteDataObjectAndCleanupReferences, loadDataObjects, upsertDataObject } from '@/lib/data-object-storage';
import { ManageDataObjectsModal } from '@/components/ManageDataObjectsModal';
import { DataObjectInspectorPanel } from '@/components/DataObjectInspectorPanel';
import { loadDataObjectAttributes } from '@/lib/data-object-attributes';
import { computeParallelOffsets, edgePath, layoutGraphWeb } from '@/lib/data-objects-layout';
import type { ToolType } from '@/components/Toolbar';
import { buildDataObjectCommentTargetKey, getThread, observeComments } from '@/lib/node-comments';
import { calculateTextHeightCustom } from '@/lib/text-measurement';
import type { PresenceController } from '@/lib/presence';
import { computeSafeViewport } from '@/lib/safe-viewport';
import { useAutoCenterOnce } from '@/hooks/use-auto-center-once';
import { usePointerPan } from '@/hooks/use-pointer-pan';
import { DATAOBJECTS_TOOL_EVENT, type DataObjectsToolEventDetail } from '@/lib/dataobjects-tool-events';

type MultiplicityMark = 'one' | 'many' | 'unknown';

function multiplicityForEdge(edge: DataObjectEdge): { start: MultiplicityMark; end: MultiplicityMark } {
  if (edge.kind === 'attribute') return { start: 'one', end: 'one' };
  const c = edge.cardinality || 'unknown';
  if (c === 'one') return { start: 'one', end: 'one' };
  if (c === 'oneToMany') return { start: 'one', end: 'many' };
  if (c === 'manyToMany') return { start: 'many', end: 'many' };
  return { start: 'unknown', end: 'unknown' };
}

function chooseBestEdgeForRender(edges: DataObjectEdge[]): DataObjectEdge {
  const kindScore = (e: DataObjectEdge): number => (e.kind === 'relation' ? 100 : 0);
  const cardScore = (e: DataObjectEdge): number => {
    if (e.kind === 'attribute') return 10; // effectively 1:1
    const c = e.cardinality || 'unknown';
    if (c === 'manyToMany') return 30;
    if (c === 'oneToMany') return 20;
    if (c === 'one') return 15;
    return 0; // unknown
  };
  const sourceScore = (e: DataObjectEdge): number => (e.source.type === 'expanded-grid' ? 5 : 0);

  return edges
    .map((e) => ({ e, score: kindScore(e) + cardScore(e) + sourceScore(e) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        `${a.e.fromId}->${a.e.toId}:${a.e.kind}`.localeCompare(`${b.e.fromId}->${b.e.toId}:${b.e.kind}`),
    )[0].e;
}

function MultiplicityGlyph({ at, angleDeg, kind }: { at: { x: number; y: number }; angleDeg: number; kind: MultiplicityMark }) {
  // Local coordinates: +x points along the connector direction.
  // We draw symbols centered around the attachment point (at).
  const stroke = '#475569';
  const strokeWidth = 1.6;

  if (kind === 'unknown') {
    return (
      <g transform={`translate(${at.x}, ${at.y}) rotate(${angleDeg})`}>
        <circle cx={0} cy={0} r={3.2} fill="#ffffff" stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  if (kind === 'one') {
    return (
      <g transform={`translate(${at.x}, ${at.y}) rotate(${angleDeg})`}>
        <line x1={0} y1={-7} x2={0} y2={7} stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  // many (crow's foot)
  return (
    <g transform={`translate(${at.x}, ${at.y}) rotate(${angleDeg})`}>
      <line x1={0} y1={0} x2={-10} y2={-7} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={0} y1={0} x2={-10} y2={0} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={0} y1={0} x2={-10} y2={7} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
}

export function DataObjectsCanvas({
  doc,
  roots,
  activeTool,
  onOpenComments,
  showComments = true,
  showAnnotations = true,
  initialFitToContent = false,
  presence,
}: {
  doc: Y.Doc;
  roots: NexusNode[];
  activeTool?: ToolType;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string; scrollToThreadId?: string }) => void;
  showComments?: boolean;
  showAnnotations?: boolean;
  /** When true, fit + center once on mount so first open shows the graph. */
  initialFitToContent?: boolean;
  presence?: PresenceController | null;
}) {
  const [graph, setGraph] = useState(() => buildMergedDataObjectGraph(doc, roots));
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [manageQuery, setManageQuery] = useState('');
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [dataStore, setDataStore] = useState(() => loadDataObjects(doc));
  const [commentsTick, setCommentsTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [annotationEditForId, setAnnotationEditForId] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<string>('');
  const [annotationPopoverPos, setAnnotationPopoverPos] = useState<{ x: number; y: number } | null>(null);

  // If user deselects annotation tool, close any open annotation popover.
  useEffect(() => {
    if (activeTool === 'annotation') return;
    if (annotationEditForId) {
      setAnnotationEditForId(null);
      setAnnotationPopoverPos(null);
      setAnnotationDraft('');
    }
  }, [activeTool, annotationEditForId]);

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => setGraph(buildMergedDataObjectGraph(doc, roots));
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, roots]);

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => setDataStore(loadDataObjects(doc));
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc]);

  useEffect(() => {
    return observeComments(doc, () => setCommentsTick((t) => t + 1));
  }, [doc]);

  // Escape clears focus selection in data objects view.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelectedId(null);
      setAnnotationEditForId(null);
      setAnnotationPopoverPos(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openManage = () => {
    const store = loadDataObjects(doc);
    setDataStore(store);
    const next: Record<string, string> = {};
    store.objects.forEach((o) => {
      next[o.id] = o.name;
    });
    setDraftNames(next);
    setManageQuery('');
    setIsManageOpen(true);
  };

  const { effectiveGraph, inlinedByParent, inlineChildToParent } = useMemo(() => {
    // Inline leaf 1:1 objects into their parent node card when they have no other links.
    // Criteria:
    // - exactly 1 incoming edge (from a parent)
    // - 0 outgoing edges
    // - that single incoming edge must be 1:1 (attribute, or relation with cardinality "one")
    // This is strictly a VIEW transform; it does not modify the underlying data.
    const incoming = new Map<string, DataObjectEdge[]>();
    const outgoing = new Map<string, DataObjectEdge[]>();
    graph.objects.forEach((o) => {
      incoming.set(o.id, []);
      outgoing.set(o.id, []);
    });
    graph.edges.forEach((e) => {
      if (!incoming.has(e.toId)) incoming.set(e.toId, []);
      if (!outgoing.has(e.fromId)) outgoing.set(e.fromId, []);
      incoming.get(e.toId)!.push(e);
      outgoing.get(e.fromId)!.push(e);
    });

    const byId = new Map(graph.objects.map((o) => [o.id, o]));
    const inlineChildToParent = new Map<string, string>();
    const inlinedByParent = new Map<string, DataObjectNode[]>();

    graph.objects.forEach((o) => {
      const ins = incoming.get(o.id) || [];
      const outs = outgoing.get(o.id) || [];
      if (ins.length !== 1) return;
      if (outs.length !== 0) return;

      const only = ins[0];
      const mult = multiplicityForEdge(only);
      const isOneToOne = mult.start === 'one' && mult.end === 'one';
      if (!isOneToOne) return;

      const parentId = only.fromId;
      if (!byId.has(parentId)) return;

      inlineChildToParent.set(o.id, parentId);
      const list = inlinedByParent.get(parentId) || [];
      list.push(o);
      inlinedByParent.set(parentId, list);
    });

    // Sort inlined items for stable display
    inlinedByParent.forEach((items, parentId) => {
      const next = [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      inlinedByParent.set(parentId, next);
    });

    const effectiveObjects = graph.objects.filter((o) => !inlineChildToParent.has(o.id));
    const effectiveEdges = graph.edges.filter((e) => !inlineChildToParent.has(e.toId) && !inlineChildToParent.has(e.fromId));

    return {
      effectiveGraph: { objects: effectiveObjects, edges: effectiveEdges } satisfies DataObjectGraph,
      inlinedByParent,
      inlineChildToParent,
    };
  }, [graph]);

  const attrsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof loadDataObjectAttributes>>();
    dataStore.objects.forEach((o) => {
      map.set(o.id, loadDataObjectAttributes(o.data));
    });
    return map;
  }, [dataStore.objects]);

  const focusSet = useMemo(() => {
    if (!selectedId) return null;
    // Focus = selected + DIRECT neighbors (1-hop), not the entire connected component.
    const focused = new Set<string>([selectedId]);
    graph.edges.forEach((e) => {
      if (e.fromId === selectedId) focused.add(e.toId);
      if (e.toId === selectedId) focused.add(e.fromId);
    });
    return focused;
  }, [graph.edges, selectedId]);

  const renderEdges = useMemo(() => {
    // Collapse multiple inferred edges between the same (from -> to) pair so we don’t draw “double lines”.
    // Prefer: relation over attribute, known cardinality over unknown, expanded-grid source over tree source.
    const grouped = new Map<string, DataObjectEdge[]>();
    effectiveGraph.edges.forEach((e) => {
      const key = `${e.fromId}__${e.toId}`;
      const g = grouped.get(key) || [];
      g.push(e);
      grouped.set(key, g);
    });
    const out: DataObjectEdge[] = [];
    grouped.forEach((g) => out.push(g.length === 1 ? g[0] : chooseBestEdgeForRender(g)));
    return out;
  }, [effectiveGraph.edges]);

  const visibleObjects = useMemo(() => effectiveGraph.objects, [effectiveGraph.objects]);

  const { layoutNodes, bounds, cardHeightById } = useMemo(() => {
    // Increase parent card height based on how many inlined items it has.
    const base = 64;
    // Reserve space for the bottom-left grey "placeholder bar" with visible breathing room.
    // This keeps the footer bar from touching the last attribute row.
    const placeholderExtra = 30;
    const chipH = 22;
    const chipGap = 6;
    const chipsPad = 10;
    const attrRowH = 16;
    const attrGap = 4;
    const attrsPad = 10;
    const attrsHeaderH = 16;
    const layoutHeightById = new Map<string, number>();
    const cardHeightById = new Map<string, number>();
    const annotationById = new Map<string, string>();
    dataStore.objects.forEach((o) => {
      if (typeof o.annotation === 'string' && o.annotation.trim()) annotationById.set(o.id, o.annotation);
    });
    effectiveGraph.objects.forEach((o) => {
      const count = (inlinedByParent.get(o.id) || []).length;
      const chipsBlock = !count ? 0 : chipsPad + count * chipH + Math.max(0, count - 1) * chipGap;
      const attrs = attrsById.get(o.id) || [];
      const showAttrs = attrs.length > 0;
      const renderAttrCount = Math.min(attrs.length, 6);
      const attrsBlock = !showAttrs
        ? 0
        : attrsPad + attrsHeaderH + renderAttrCount * attrRowH + Math.max(0, renderAttrCount - 1) * attrGap;
      const ann = annotationById.get(o.id);
      const annotationExtra = ann
        ? 6 +
          calculateTextHeightCustom({
            text: ann,
            boxWidth: 220,
            paddingX: 12,
            paddingY: 0,
            fontSizePx: 11,
            fontWeight: 400,
            lineHeight: 1.35,
          })
        : 0;
      const cardH = base + chipsBlock + attrsBlock + placeholderExtra;
      cardHeightById.set(o.id, cardH);
      // Layout reserves space for the annotation below the card.
      layoutHeightById.set(o.id, cardH + (ann ? 8 + annotationExtra : 0));
    });

    // Use renderEdges for layout forces too (keeps layout consistent with what we draw).
    const { nodes, bounds } = layoutGraphWeb({ objects: effectiveGraph.objects, edges: renderEdges }, layoutHeightById);
    const map = new Map(nodes.map((n) => [n.id, n]));
    return { layoutNodes: map, bounds, cardHeightById };
  }, [effectiveGraph.objects, inlinedByParent, renderEdges, dataStore.objects]);

  const parallelOffsets = useMemo(() => computeParallelOffsets(renderEdges), [renderEdges]);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const getSafeViewport = useCallback(() => computeSafeViewport({ containerEl: containerRef.current, view: 'dataObjects' }), []);

  const isInteractiveTarget = useCallback((t: EventTarget | null) => {
    const target = t as HTMLElement | null;
    if (!target) return false;
    return !!target.closest?.('[data-do-card], [data-do-bubble], [data-do-annotation], [data-do-popover]');
  }, []);

  const panGesture = usePointerPan({
    enabled: activeTool !== 'comment' && activeTool !== 'annotation',
    // If something is selected (or Space held), allow panning from anywhere.
    allowFromInteractive: !!selectedId || isSpaceHeld,
    isInteractiveTarget,
    onPanBy: ({ dx, dy }) => {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    },
    onPointerMove: (evt) => {
      // Multiplayer cursor (world-space in graph coords)
      if (!presence) return;
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      const worldX = (evt.clientX - r.left - pan.x) / scale;
      const worldY = (evt.clientY - r.top - pan.y) / scale;
      presence.setCursor({ x: worldX, y: worldY });
    },
  });

  // Broadcast current transform so the bottom toolbar can show x/y tooltip.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    window.dispatchEvent(
      new CustomEvent('diregram:viewTransform', {
        detail: {
          view: 'dataObjects',
          x: Math.round(pan.x),
          y: Math.round(pan.y),
          z: round2(scale),
        },
      }),
    );
  }, [pan.x, pan.y, scale]);

  // Match NexusCanvas zoom limits/feel as closely as possible.
  const clampScale = (s: number) => Math.max(0.1, Math.min(5, s));
  void commentsTick; // re-render on collaborative comment updates

  const zoomAtClientPoint = useCallback((nextScaleRaw: number, clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) {
      setScale(clampScale(nextScaleRaw));
      return;
    }
    const rect = el.getBoundingClientRect();
    const nextScale = clampScale(nextScaleRaw);

    // World point under cursor before zoom:
    const wx = (clientX - rect.left - pan.x) / Math.max(1e-6, scale);
    const wy = (clientY - rect.top - pan.y) / Math.max(1e-6, scale);

    // Keep that world point under the cursor after zoom:
    const nextPanX = clientX - rect.left - wx * nextScale;
    const nextPanY = clientY - rect.top - wy * nextScale;

    setScale(nextScale);
    setPan({ x: nextPanX, y: nextPanY });
  }, [pan.x, pan.y, scale]);

  const fitToContent = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const safe = getSafeViewport();
    if (!safe) return;
    const cw = safe.width;
    const ch = safe.height;
    if (!cw || !ch) return;
    const PAD = 80;
    const w = Math.max(1, bounds.width + PAD * 2);
    const h = Math.max(1, bounds.height + PAD * 2);
    const fit = clampScale(Math.min(cw / w, ch / h));
    setScale(fit);
    setPan({
      x: safe.centerX - (bounds.width / 2) * fit,
      y: safe.centerY - (bounds.height / 2) * fit,
    });
  }, [bounds.width, bounds.height, getSafeViewport]);

  const zoomIn = useCallback(() => {
    const el = containerRef.current;
    if (!el) return setScale((s) => clampScale(s * 1.1));
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    zoomAtClientPoint(scale * 1.1, cx, cy);
  }, [scale, zoomAtClientPoint]);

  const zoomOut = useCallback(() => {
    const el = containerRef.current;
    if (!el) return setScale((s) => clampScale(s / 1.1));
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    zoomAtClientPoint(scale / 1.1, cx, cy);
  }, [scale, zoomAtClientPoint]);

  // Space-to-pan (matches the main canvas ergonomics).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      // Don't hijack typing in inputs/textareas.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLSelectElement) return;
      setIsSpaceHeld(true);
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      setIsSpaceHeld(false);
      // Pointer capture handles drag cancellation; just end "space held" mode.
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Fit + center once on mount (first open).
  useEffect(() => {
    if (!initialFitToContent) return;
    // Defer until after layout so clientWidth/Height are stable.
    const raf = window.requestAnimationFrame(() => {
      fitToContent();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [initialFitToContent, fitToContent]);

  // Listen for toolbar actions (we keep the canvas uncluttered).
  useEffect(() => {
    const onTool = (evt: Event) => {
      const e = evt as CustomEvent<DataObjectsToolEventDetail>;
      const tool = e.detail?.tool;
      if (!tool) return;
      if (tool === 'new') {
        const name = window.prompt('Data object name?', 'New object') || '';
        const obj = createDataObject(doc, name);
        setSelectedId(obj.id);
      }
      if (tool === 'manage') openManage();
      if (tool === 'zoomIn') zoomIn();
      if (tool === 'zoomOut') zoomOut();
      if (tool === 'center') fitToContent();
    };
    window.addEventListener(DATAOBJECTS_TOOL_EVENT, onTool as EventListener);
    return () => window.removeEventListener(DATAOBJECTS_TOOL_EVENT, onTool as EventListener);
  }, [fitToContent, openManage, zoomIn, zoomOut]);

  // Auto-center selection (once per selection change; never fight dragging)
  useAutoCenterOnce({
    key: selectedId,
    blocked: panGesture.isDragging || !!panGesture.dragRef.current,
    center: () => {
      if (!selectedId) return;
    const el = containerRef.current;
    if (!el) return;
    const safe = getSafeViewport();
    if (!safe) return;
    const idToCenter = inlineChildToParent.get(selectedId) || selectedId;
    const ln = layoutNodes.get(idToCenter);
    if (!ln) return;
    const cw = safe.width;
    const ch = safe.height;
    if (!cw || !ch) return;
    const cardH = cardHeightById.get(idToCenter) ?? ln.height;
    const cx = (ln.x + ln.width / 2) * scale;
    const cy = (ln.y + cardH / 2) * scale;
    const targetPanX = safe.centerX - cx;
    const targetPanY = safe.centerY - cy;
    setPan({ x: targetPanX, y: targetPanY });
    },
  });

  const saveAnnotation = (dataObjectId: string, annotation: string | null | undefined) => {
    const store = loadDataObjects(doc);
    const obj = store.objects.find((o) => o.id === dataObjectId);
    if (!obj) return;
    upsertDataObject(doc, { ...obj, annotation: (annotation ?? '').trim() || undefined });
  };

  return (
    <div
      className="absolute inset-0 mac-canvas-bg"
      style={
        {
          '--canvas-zoom': scale,
        } as CSSProperties
      }
    >
      {selectedId ? (
        <DataObjectInspectorPanel
          doc={doc}
          graph={graph}
          store={dataStore}
          selectedId={selectedId}
          onClose={() => setSelectedId(null)}
          onSelectId={(id) => setSelectedId(id)}
          onCreateNew={() => {
            const name = window.prompt('Data object name?', 'New object') || '';
            const obj = createDataObject(doc, name);
            setSelectedId(obj.id);
          }}
          onDelete={(id) => {
            const cleanId = String(id || '').trim();
            if (!cleanId) return;
            const ok = window.confirm(
              `Delete data object "${cleanId}"?\n\nThis will also remove any node/expanded-grid links to it.`,
            );
            if (!ok) return;
            deleteDataObjectAndCleanupReferences(doc, cleanId);
            setSelectedId(null);
          }}
        />
      ) : null}

      <ManageDataObjectsModal
        open={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        objects={dataStore.objects}
        query={manageQuery}
        onQueryChange={setManageQuery}
        draftNames={draftNames}
        onDraftNameChange={(id, name) => setDraftNames((prev) => ({ ...prev, [id]: name }))}
        onCommitName={(id) => {
          const obj = dataStore.objects.find((o) => o.id === id);
          if (!obj) return;
          const nextName = (draftNames[id] ?? obj.name).trim();
          if (!nextName || nextName === obj.name) return;
          upsertDataObject(doc, { ...obj, name: nextName });
        }}
      />

      <div
        className="absolute inset-0"
        ref={containerRef}
        {...panGesture.handlers}
        onBlur={() => {
          // Safety: if we lose focus mid-interaction, stop publishing cursor.
          if (presence) presence.setCursor(null);
        }}
        onMouseLeave={() => {
          if (presence) presence.setCursor(null);
        }}
        onWheel={(e) => {
          // Trackpad scroll pans (like the main canvas). Ctrl/Cmd + wheel zooms.
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomSpeed = 0.001; // match NexusCanvas
            zoomAtClientPoint(scale - e.deltaY * zoomSpeed, e.clientX, e.clientY);
            return;
          }
          // Pan with 2-finger scroll.
          setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }}
        style={{
          cursor:
            activeTool === 'comment' || activeTool === 'annotation'
              ? 'default'
              : panGesture.isDragging
                ? 'grabbing'
                : isSpaceHeld
                  ? 'grab'
                  : 'default',
        }}
        onClick={() => {
          if (panGesture.consumeDidPan()) return;
          setSelectedId(null);
          setAnnotationEditForId(null);
          setAnnotationPopoverPos(null);
        }}
      >
        {/* Multiplayer cursors (screen-space overlay) */}
        {presence?.peers?.length ? (
          <div className="pointer-events-none absolute inset-0 z-50">
            {presence.peers
              .filter((p) => p.state?.view === 'dataObjects' && p.state?.cursor)
              .map((p) => {
                const c = p.state.cursor!;
                const x = c.x * scale + pan.x;
                const y = c.y * scale + pan.y;
                return (
                  <div key={`do-cursor-${p.clientId}`} className="absolute" style={{ left: x, top: y }}>
                    <div className="w-3 h-3 border border-black bg-white mac-shadow-hard" />
                    <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] mac-double-outline ${p.state.user.badgeClass}`}>
                      <span className="font-semibold">{p.state.user.name}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : null}
        <div
          className="relative"
          style={{
            width: bounds.width,
            height: bounds.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg
            width={bounds.width}
            height={bounds.height}
            className="absolute inset-0"
            style={{ overflow: 'visible' }}
          >
            {renderEdges.map((e, idx) => {
              const isEdgeFocused = !focusSet || (focusSet.has(e.fromId) && focusSet.has(e.toId));
              const fromRaw = layoutNodes.get(e.fromId);
              const toRaw = layoutNodes.get(e.toId);
              const fromH = cardHeightById.get(e.fromId);
              const toH = cardHeightById.get(e.toId);
              const from = fromRaw && typeof fromH === 'number' ? { ...fromRaw, height: fromH } : fromRaw;
              const to = toRaw && typeof toH === 'number' ? { ...toRaw, height: toH } : toRaw;
              if (!from || !to) return null;
              const offset = parallelOffsets.get(idx) || 0;
              const { d, start, end, c1, c2, angleDeg } = edgePath(from, to, offset);
              const isAttribute = e.kind === 'attribute';
              const mult = multiplicityForEdge(e);

              // Place glyphs using the cubic Bezier tangents so they sit ON the curve (not on the straight chord).
              const normalize = (dx: number, dy: number) => {
                const len = Math.max(1e-6, Math.hypot(dx, dy));
                return { x: dx / len, y: dy / len };
              };
              const tStart = normalize(c1.x - start.x, c1.y - start.y);
              const tEnd = normalize(end.x - c2.x, end.y - c2.y); // direction INTO the end point

              const inset = 10;
              const startAt = { x: start.x + tStart.x * inset, y: start.y + tStart.y * inset };
              const endAt = { x: end.x - tEnd.x * inset, y: end.y - tEnd.y * inset };

              const startAngle = (Math.atan2(tStart.y, tStart.x) * 180) / Math.PI;
              const endAngle = (Math.atan2(tEnd.y, tEnd.x) * 180) / Math.PI + 180;
              return (
                <g key={`${e.fromId}-${e.toId}-${e.kind}-${idx}`} opacity={isEdgeFocused ? 0.95 : 0.12}>
                  <path
                    d={d}
                    stroke="#000000"
                    strokeWidth={isAttribute ? 1.2 : 1.6}
                    fill="none"
                    strokeDasharray={isAttribute ? '4 4' : undefined}
                  />
                  <MultiplicityGlyph at={startAt} angleDeg={startAngle || angleDeg} kind={mult.start} />
                  <MultiplicityGlyph at={endAt} angleDeg={endAngle} kind={mult.end} />
                </g>
              );
            })}
          </svg>

          {visibleObjects.map((o) => {
            const ln = layoutNodes.get(o.id);
            if (!ln) return null;
            const inlined = inlinedByParent.get(o.id) || [];
            const isFocused =
              !focusSet || focusSet.has(o.id) || inlined.some((child) => focusSet.has(child.id));
            const ann = dataStore.objects.find((x) => x.id === o.id)?.annotation;
            const attrs = attrsById.get(o.id) || [];
            const attrsToShow = attrs.slice(0, 6);
            const cardH = cardHeightById.get(o.id) ?? ln.height;
            const thread = getThread(doc, buildDataObjectCommentTargetKey(o.id));
            const hasComment = !!thread;
            const commentCount = thread ? 1 + (thread.replies?.length || 0) : 0;
            const isSelected = selectedId === o.id || inlined.some((c) => c.id === selectedId);
            return (
              <Fragment key={o.id}>
                <div
                  className={`absolute dg-do-card select-none flex flex-col ${
                    o.missing ? 'is-missing' : ''
                  } ${isSelected ? 'is-selected' : ''} ${
                    selectedId && !isFocused ? 'opacity-25 hover:opacity-60 transition-opacity' : ''
                  }`}
                  data-do-card
                  style={{ left: ln.x, top: ln.y, width: ln.width, height: cardH }}
                  title={o.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (panGesture.consumeDidPan()) return;
                    if (activeTool === 'annotation') {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      setAnnotationEditForId(o.id);
                      setAnnotationDraft((ann || '').toString());
                      setAnnotationPopoverPos({ x: rect.right + 8, y: rect.top });
                      return;
                    }
                    if (activeTool === 'comment') {
                      onOpenComments?.({
                        targetKey: buildDataObjectCommentTargetKey(o.id),
                        targetLabel: `${o.name || o.id} (${o.id})`,
                        ...(thread ? { scrollToThreadId: thread.id } : {}),
                      });
                      return;
                    }
                    setSelectedId((cur) => (cur === o.id ? null : o.id));
                  }}
                  onPointerDown={(e) => {
                    // When nothing is selected and Space isn't held, clicking on cards shouldn't start a pan.
                    // (Pan start is handled at the container in capture phase.)
                    if (!selectedId && !isSpaceHeld) e.stopPropagation();
                  }}
                >
                  {showComments && (hasComment || activeTool === 'comment') && (
                    <button
                      type="button"
                      data-do-bubble
                      className="absolute -right-2 -top-2 h-6 min-w-6 px-1.5 rounded-full text-[11px] shadow-sm hover:opacity-90 dg-do-bubble"
                      title={hasComment ? 'Open comment' : 'Add comment'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenComments?.({
                          targetKey: buildDataObjectCommentTargetKey(o.id),
                          targetLabel: `${o.name || o.id} (${o.id})`,
                          ...(thread ? { scrollToThreadId: thread.id } : {}),
                        });
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                    >
                      {hasComment ? commentCount : '+'}
                    </button>
                  )}
                  <div className="dg-node-card__meta-row">
                    <span className="dg-node-card__meta-label">Data object</span>
                    <span className="dg-node-card__meta-id">{o.id}</span>
                  </div>
                  <div className="dg-node-card__title">{o.name || o.id}</div>
                  {o.missing ? <div className="text-[10px] text-red-700 mt-1">referenced but missing</div> : null}
                  {attrsToShow.length ? (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Attributes</div>
                      <div className="space-y-1">
                        {attrsToShow.map((a) => (
                          <div key={a.id} className="text-[11px] text-slate-700 truncate" title={a.sample ? `${a.name}: ${a.sample}` : a.name}>
                            <span className="font-medium">{a.name}</span>
                            {a.sample && a.sample.trim() ? <span className="text-slate-500">: {a.sample}</span> : null}
                          </div>
                        ))}
                        {attrs.length > attrsToShow.length ? (
                          <div className="text-[11px] text-slate-500">+{attrs.length - attrsToShow.length} more…</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {inlined.length ? (
                    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                      {inlined.map((child) => (
                        <div
                          key={child.id}
                          className={`px-2 py-1 text-[11px] truncate dg-do-inline ${
                            child.missing
                              ? 'bg-red-50 border-red-200 text-red-800'
                              : 'text-slate-800'
                          } ${selectedId === child.id ? 'is-selected' : ''} cursor-pointer`}
                          title={child.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeTool === 'comment') return;
                            if (activeTool === 'annotation') return;
                            setSelectedId(child.id);
                          }}
                        >
                          <span className="font-medium">{child.name || child.id}</span>
                          <span className="text-[10px] text-slate-500"> · {child.id}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-auto pt-4">
                    <div className="dg-node-card__placeholder" />
                  </div>
                </div>

                {showAnnotations && ann && ann.trim() ? (
                  <div
                    className="absolute"
                    data-do-annotation
                    style={{
                      left: ln.x,
                      top: ln.y + cardH + 8,
                      width: ln.width,
                      pointerEvents: 'auto',
                      opacity: selectedId && !isFocused ? 0.25 : 1,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool === 'annotation') {
                        // Open the annotation editor prefilled
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        setAnnotationEditForId(o.id);
                        setAnnotationDraft((ann || '').toString());
                        setAnnotationPopoverPos({ x: rect.right + 8, y: rect.top });
                      } else if (activeTool === 'comment') {
                        onOpenComments?.({
                          targetKey: buildDataObjectCommentTargetKey(o.id),
                          targetLabel: `${o.name || o.id} (${o.id})`,
                          ...(thread ? { scrollToThreadId: thread.id } : {}),
                        });
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm">
                      <div className="text-[11px] text-slate-700 whitespace-pre-wrap break-words">{ann}</div>
                    </div>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>

        {annotationEditForId && annotationPopoverPos ? (
          <div
            data-do-popover
            className="fixed z-50 w-[320px] p-3 dg-do-popover"
            style={{ left: annotationPopoverPos.x, top: annotationPopoverPos.y }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Data object annotation
            </div>
            <textarea
              value={annotationDraft}
              onChange={(e) => setAnnotationDraft(e.target.value)}
              rows={4}
              className="mac-field w-full px-2 py-1 text-[12px]"
              placeholder="Write an annotation…"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="mac-btn h-7 px-2"
                onClick={() => {
                  saveAnnotation(annotationEditForId, '');
                  setAnnotationEditForId(null);
                  setAnnotationPopoverPos(null);
                }}
                title="Delete annotation"
              >
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="mac-btn h-7 px-2"
                  onClick={() => {
                    setAnnotationEditForId(null);
                    setAnnotationPopoverPos(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="mac-btn mac-btn--primary h-7 px-2 text-[11px] font-semibold"
                  onClick={() => {
                    saveAnnotation(annotationEditForId, annotationDraft);
                    setAnnotationEditForId(null);
                    setAnnotationPopoverPos(null);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Hint removed (redundant once you know the controls). */}
      </div>
    </div>
  );
}
