'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
// no top-strip destructive actions; delete is in the bottom toolbar
import { loadDataObjects } from '@/lib/data-object-storage';
import { DataObjectSearchSelect } from '@/components/DataObjectSearchSelect';
import { DataObjectAttributeMultiSelect } from '@/components/DataObjectAttributeMultiSelect';
import type { ToolType } from '@/components/Toolbar';
import type { PresenceController } from '@/lib/presence';
import { buildSystemFlowBoxCommentTargetKey, getThread, observeComments } from '@/lib/node-comments';
import { CELL_PX, GAP_PX, autoSide, clamp, measureLabel, oppositeSide, rectsOverlap, snapPx } from '@/components/systemflow/systemflow-geometry';
import {
  loadSystemFlowStateFromDoc,
  saveSystemFlowStateToDoc,
  type SystemFlowBoxPersisted,
  type SystemFlowLinkPersisted,
  type SystemFlowSide,
  type SystemFlowState,
  type SystemFlowZonePersisted,
} from '@/lib/system-flow-storage';
import { upsertTemplateHeader, type NexusTemplateHeader } from '@/lib/nexus-template';
import { InsertFromTemplateModal, type WorkspaceFileLite as TemplateWorkspaceFileLite } from '@/components/templates/InsertFromTemplateModal';
import { SaveTemplateModal } from '@/components/templates/SaveTemplateModal';

type Mode = 'select' | 'link';
type LinkDashStyle = 'solid' | 'dashed';
type LinkEndShape = 'none' | 'arrow' | 'circle' | 'square';

const ZONE_PAD_PX = 44;
const CONTROL_POINT_R = 6;
const PORT_EDGE_PAD_PX = 12;

export function SystemFlowEditor({
  doc,
  sfid,
  activeTool,
  showComments,
  showAnnotations,
  onOpenComments,
  presence,
  templateScope,
  onTemplateScopeChange,
  templateFiles,
  loadTemplateMarkdown,
  onSaveTemplateFile,
  templateSourceLabel,
  globalTemplatesEnabled,
}: {
  doc: Y.Doc;
  sfid: string;
  activeTool: ToolType;
  showComments: boolean;
  showAnnotations: boolean;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string; scrollToThreadId?: string }) => void;
  presence?: PresenceController | null;
  templateScope?: 'project' | 'account' | 'global';
  onTemplateScopeChange?: (next: 'project' | 'account' | 'global') => void;
  templateFiles?: TemplateWorkspaceFileLite[];
  loadTemplateMarkdown?: (fileId: string) => Promise<string>;
  onSaveTemplateFile?: (res: { name: string; content: string; scope?: 'project' | 'account' }) => Promise<void> | void;
  templateSourceLabel?: string;
  globalTemplatesEnabled?: boolean;
}) {
  const [state, setState] = useState<SystemFlowState>(() => loadSystemFlowStateFromDoc(doc, sfid));
  const [mode, setMode] = useState<Mode>('select');
  const [selectedBoxKeys, setSelectedBoxKeys] = useState<string[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [linkFromKey, setLinkFromKey] = useState<string | null>(null);
  const draggingLinkPointRef = useRef<{ linkId: string; idx: number } | null>(null);
  const draggingLinkEndpointRef = useRef<{ linkId: string; end: 'from' | 'to' } | null>(null);
  const draggingLinkLabelRef = useRef<{ linkId: string } | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingLinkDraft, setEditingLinkDraft] = useState<string>('');
  const [commentsTick, setCommentsTick] = useState(0);
  const [annotationEditForKey, setAnnotationEditForKey] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<string>('');
  const [annotationPopoverPos, setAnnotationPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [insertFromTemplateOpen, setInsertFromTemplateOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [pendingTemplatePayload, setPendingTemplatePayload] = useState<string | null>(null);
  const [pendingTemplateHeaderBase, setPendingTemplateHeaderBase] = useState<Omit<NexusTemplateHeader, 'name'> | null>(null);
  const [pendingTemplateDefaultName, setPendingTemplateDefaultName] = useState<string>('Template');

  type SystemFlowBoxTemplateV1 = {
    version: 1;
    name: string;
    icon?: string;
    color?: string;
    annotation?: string;
    dataObjectId?: string;
    dataObjectAttributeIds?: string[];
    gridWidth: number;
    gridHeight: number;
  };

  const parseSystemFlowBoxTemplate = (rendered: string): SystemFlowBoxTemplateV1 => {
    const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
    const m = src.match(/```nexus-systemflow-box[ \t]*\n([\s\S]*?)\n```/);
    const body = (m ? m[1] : src).trim();
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid system flow template payload.');
    const r = parsed as Record<string, unknown>;
    if (r.version !== 1) throw new Error('Unsupported system flow box template version.');
    const name = typeof r.name === 'string' ? r.name : 'Box';
    const gridWidth = Number(r.gridWidth);
    const gridHeight = Number(r.gridHeight);
    if (!Number.isFinite(gridWidth) || !Number.isFinite(gridHeight)) throw new Error('Invalid box size.');
    const attrs = Array.isArray(r.dataObjectAttributeIds)
      ? (r.dataObjectAttributeIds as unknown[]).map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
      : undefined;
    return {
      version: 1,
      name,
      icon: typeof r.icon === 'string' ? r.icon : undefined,
      color: typeof r.color === 'string' ? r.color : undefined,
      annotation: typeof r.annotation === 'string' ? r.annotation : undefined,
      dataObjectId: typeof r.dataObjectId === 'string' ? r.dataObjectId : undefined,
      dataObjectAttributeIds: attrs,
      gridWidth: Math.max(1, Math.min(12, Math.round(gridWidth))),
      gridHeight: Math.max(1, Math.min(12, Math.round(gridHeight))),
    };
  };

  // Drag state
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);

  // Resize state (bottom-right only for now)
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const resizeStartRef = useRef<{ clientX: number; clientY: number; startW: number; startH: number } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const draftDuringInteractionRef = useRef<SystemFlowState | null>(null);
  const didMutateDuringInteractionRef = useRef(false);
  const scaleRef = useRef<number>(1);
  const [scale, setScale] = useState<number>(1);

  // Live-load on markdown changes (collab / undo)
  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => setState(loadSystemFlowStateFromDoc(doc, sfid));
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, sfid]);

  useEffect(() => {
    return observeComments(doc, () => setCommentsTick((t) => t + 1));
  }, [doc]);

  const persist = useCallback(
    (next: SystemFlowState) => {
      setState(next);
      saveSystemFlowStateToDoc(doc, sfid, next);
    },
    [doc, sfid],
  );

  const setDraft = useCallback((next: SystemFlowState) => {
    draftDuringInteractionRef.current = next;
    didMutateDuringInteractionRef.current = true;
    setState(next);
  }, []);

  const byKey = useMemo(() => new Map(state.boxes.map((b) => [b.key, b])), [state.boxes]);
  const selectedBox = selectedBoxKeys.length === 1 ? byKey.get(selectedBoxKeys[0]) || null : null;
  const selectedLink = selectedLinkId ? state.links.find((l) => l.id === selectedLinkId) || null : null;
  const selectedZone = selectedZoneId ? state.zones.find((z) => z.id === selectedZoneId) || null : null;
  const steps = useMemo(() => {
    return state.links
      .slice()
      .filter((l) => typeof l.order === 'number' && Number.isFinite(l.order))
      .sort((a, b) => (a.order as number) - (b.order as number));
  }, [state.links]);

  const dataStore = useMemo(() => loadDataObjects(doc), [doc, state.boxes.length]);
  const dataObjectOptions = useMemo(
    () => dataStore.objects.map((o) => ({ id: o.id, name: o.name || o.id })),
    [dataStore.objects],
  );

  const gridPixelSize = useMemo(() => {
    const w = state.gridWidth * CELL_PX + Math.max(0, state.gridWidth - 1) * GAP_PX;
    const h = state.gridHeight * CELL_PX + Math.max(0, state.gridHeight - 1) * GAP_PX;
    return { w, h };
  }, [state.gridWidth, state.gridHeight]);

  const gridToPx = useCallback((gx: number, gy: number) => {
    return { left: gx * (CELL_PX + GAP_PX), top: gy * (CELL_PX + GAP_PX) };
  }, []);

  const boxToRectPx = useCallback((b: SystemFlowBoxPersisted) => {
    const { left, top } = gridToPx(b.gridX, b.gridY);
    const w = b.gridWidth * CELL_PX + Math.max(0, b.gridWidth - 1) * GAP_PX;
    const h = b.gridHeight * CELL_PX + Math.max(0, b.gridHeight - 1) * GAP_PX;
    return { left, top, w, h };
  }, [gridToPx]);

  const pixelToGrid = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { gx: 0, gy: 0 };
    const r = el.getBoundingClientRect();
    const s = scaleRef.current || 1;
    const relX = (clientX - r.left) / s;
    const relY = (clientY - r.top) / s;
    const step = CELL_PX + GAP_PX;
    const gx = clamp(Math.floor(relX / step), 0, Math.max(0, state.gridWidth - 1));
    const gy = clamp(Math.floor(relY / step), 0, Math.max(0, state.gridHeight - 1));
    return { gx, gy };
  }, [state.gridWidth, state.gridHeight]);

  // Fit the grid to the available viewport (no scrolling).
  useEffect(() => {
    const update = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const availableW = Math.max(1, r.width);
      const availableH = Math.max(1, r.height);
      const sx = availableW / gridPixelSize.w;
      const sy = availableH / gridPixelSize.h;
      const next = clamp(Math.min(sx, sy), 0.25, 2);
      scaleRef.current = next;
      setScale(next);
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [gridPixelSize.h, gridPixelSize.w]);

  const findFirstEmptyCell = useCallback((): { x: number; y: number } | null => {
    for (let y = 0; y < state.gridHeight; y += 1) {
      for (let x = 0; x < state.gridWidth; x += 1) {
        const occupied = state.boxes.some((n) => x >= n.gridX && x < n.gridX + n.gridWidth && y >= n.gridY && y < n.gridY + n.gridHeight);
        if (!occupied) return { x, y };
      }
    }
    return null;
  }, [state.boxes, state.gridHeight, state.gridWidth]);

  const nextBoxKey = useCallback(() => {
    let max = 0;
    state.boxes.forEach((b) => {
      const m = b.key.match(/^sfbox-(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return `sfbox-${max + 1}`;
  }, [state.boxes]);

  const addBox = useCallback(() => {
    const empty = findFirstEmptyCell();
    if (!empty) return;
    const key = nextBoxKey();
    const next: SystemFlowBoxPersisted = {
      key,
      name: 'New box',
      gridX: empty.x,
      gridY: empty.y,
      gridWidth: 2,
      gridHeight: 2,
    };
    persist({ ...state, boxes: [...state.boxes, next] });
    setSelectedBoxKeys([key]);
    setSelectedLinkId(null);
  }, [findFirstEmptyCell, nextBoxKey, persist, state]);

  const insertBoxFromTemplate = useCallback(
    (tpl: SystemFlowBoxTemplateV1) => {
      const empty = findFirstEmptyCell();
      if (!empty) throw new Error('No empty space available.');
      const key = nextBoxKey();
      const next: SystemFlowBoxPersisted = {
        key,
        name: String(tpl.name || 'Box'),
        ...(tpl.icon ? { icon: tpl.icon } : null),
        ...(tpl.color ? { color: tpl.color } : null),
        ...(tpl.annotation ? { annotation: tpl.annotation } : null),
        ...(tpl.dataObjectId ? { dataObjectId: tpl.dataObjectId } : null),
        ...(tpl.dataObjectAttributeIds && tpl.dataObjectAttributeIds.length ? { dataObjectAttributeIds: tpl.dataObjectAttributeIds } : null),
        gridX: empty.x,
        gridY: empty.y,
        gridWidth: tpl.gridWidth,
        gridHeight: tpl.gridHeight,
      };
      persist({ ...state, boxes: [...state.boxes, next] });
      setSelectedBoxKeys([key]);
      setSelectedLinkId(null);
      setSelectedZoneId(null);
    },
    [findFirstEmptyCell, nextBoxKey, persist, state],
  );

  const deleteSelection = useCallback(() => {
    if (selectedLinkId) {
      const links = state.links.filter((l) => l.id !== selectedLinkId);
      persist({ ...state, links });
      setSelectedLinkId(null);
      return;
    }
    if (!selectedBoxKeys.length) return;
    const toDelete = new Set(selectedBoxKeys);
    const boxes = state.boxes.filter((b) => !toDelete.has(b.key));
    const links = state.links.filter((l) => !toDelete.has(l.fromKey) && !toDelete.has(l.toKey));
    const zones = state.zones.map((z) => ({ ...z, boxKeys: z.boxKeys.filter((k) => !toDelete.has(k)) })).filter((z) => z.boxKeys.length > 0);
    persist({ ...state, boxes, links, zones });
    setSelectedBoxKeys([]);
    setSelectedLinkId(null);
  }, [persist, selectedBoxKeys, selectedLinkId, state]);

  const commitBoxUpdate = useCallback(
    (key: string, patch: Partial<SystemFlowBoxPersisted>) => {
      const boxes = state.boxes.map((b) => (b.key === key ? { ...b, ...patch } : b));
      persist({ ...state, boxes });
    },
    [persist, state],
  );

  const saveBoxAnnotation = useCallback(
    (boxKey: string, annotation: string) => {
      const next = state.boxes.map((b) => (b.key === boxKey ? { ...b, annotation } : b));
      persist({ ...state, boxes: next });
    },
    [persist, state],
  );

  const commitLinkUpdate = useCallback(
    (id: string, patch: Partial<SystemFlowLinkPersisted>) => {
      const links = state.links.map((l) => (l.id === id ? { ...l, ...patch } : l));
      persist({ ...state, links });
    },
    [persist, state],
  );

  const updateLinkDraft = useCallback(
    (id: string, patch: Partial<SystemFlowLinkPersisted>) => {
      const links = state.links.map((l) => (l.id === id ? { ...l, ...patch } : l));
      setDraft({ ...state, links });
    },
    [setDraft, state],
  );

  const commitGridSize = useCallback(
    (dw: number, dh: number) => {
      const nextW = clamp(state.gridWidth + dw, 1, 200);
      const nextH = clamp(state.gridHeight + dh, 1, 200);
      // When shrinking, ensure all boxes still fit.
      const invalid = state.boxes.some((b) => b.gridX + b.gridWidth > nextW || b.gridY + b.gridHeight > nextH);
      if (invalid) return;
      persist({ ...state, gridWidth: nextW, gridHeight: nextH });
    },
    [persist, state],
  );

  const nextZoneId = useCallback(() => {
    let max = 0;
    state.zones.forEach((z) => {
      const m = z.id.match(/^sfzone-(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return `sfzone-${max + 1}`;
  }, [state.zones]);

  const groupSelectionIntoZone = useCallback(() => {
    if (selectedBoxKeys.length < 2) return;
    const name = window.prompt('Zone name?', 'Zone');
    if (!name) return;
    const palette: Array<SystemFlowZonePersisted['outlineStyle']> = ['solid', 'dashed', 'dotted', 'double'];
    const outlineStyle = palette[Math.floor(Math.random() * palette.length)];
    const zone: SystemFlowZonePersisted = { id: nextZoneId(), name: name.trim(), boxKeys: [...selectedBoxKeys], outlineStyle };
    persist({ ...state, zones: [...state.zones, zone] });
  }, [nextZoneId, persist, selectedBoxKeys, state]);

  // Bottom-toolbar integration (EditorApp dispatches these events when System Flow tab is active)
  useEffect(() => {
    const onTool = (e: Event) => {
      const ce = e as CustomEvent<{ type?: string }>;
      const type = ce?.detail?.type;
      if (!type) return;
      if (type === 'addBox') addBox();
      if (type === 'toggleLinkMode') {
        setMode((m) => {
          const next = m === 'link' ? 'select' : 'link';
          if (next !== 'link') setLinkFromKey(null);
          return next;
        });
      }
      if (type === 'createZone') groupSelectionIntoZone();
      if (type === 'deleteSelection') deleteSelection();
    };
    window.addEventListener('systemflow:tool', onTool as EventListener);
    return () => window.removeEventListener('systemflow:tool', onTool as EventListener);
  }, [addBox, deleteSelection, groupSelectionIntoZone]);

  const nextLinkId = useCallback(() => {
    let max = 0;
    state.links.forEach((l) => {
      const m = l.id.match(/^sflink-(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return `sflink-${max + 1}`;
  }, [state.links]);

  const handleClickBox = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedLinkId(null);
      setSelectedZoneId(null);
      if (mode === 'link') {
        if (!linkFromKey) {
          setLinkFromKey(key);
          setSelectedBoxKeys([key]);
          return;
        }
        if (linkFromKey === key) return;
        const a = byKey.get(linkFromKey);
        const b = byKey.get(key);
        if (!a || !b) return;
        const fromCenter = { cx: a.gridX + a.gridWidth / 2, cy: a.gridY + a.gridHeight / 2 };
        const toCenter = { cx: b.gridX + b.gridWidth / 2, cy: b.gridY + b.gridHeight / 2 };
        const fromSide = autoSide(fromCenter, toCenter);
        const toSide = oppositeSide(fromSide);
        const link: SystemFlowLinkPersisted = {
          id: nextLinkId(),
          fromKey: linkFromKey,
          toKey: key,
          fromSide,
          toSide,
          text: '',
        };
        persist({ ...state, links: [...state.links, link] });
        setLinkFromKey(null);
        setMode('select');
        setSelectedBoxKeys([key]);
        return;
      }

      const isShift = e.shiftKey;
      setSelectedBoxKeys((prev) => {
        if (!isShift) return [key];
        const s = new Set(prev);
        if (s.has(key)) s.delete(key);
        else s.add(key);
        return Array.from(s.values());
      });
    },
    [byKey, linkFromKey, mode, nextLinkId, persist, state],
  );

  const canPlace = useCallback(
    (key: string, nextRect: { x: number; y: number; w: number; h: number }) => {
      if (nextRect.x < 0 || nextRect.y < 0) return false;
      if (nextRect.x + nextRect.w > state.gridWidth) return false;
      if (nextRect.y + nextRect.h > state.gridHeight) return false;
      const a = { x: nextRect.x, y: nextRect.y, w: nextRect.w, h: nextRect.h };
      return !state.boxes.some((b) => {
        if (b.key === key) return false;
        const bb = { x: b.gridX, y: b.gridY, w: b.gridWidth, h: b.gridHeight };
        return rectsOverlap(a, bb);
      });
    },
    [state.boxes, state.gridHeight, state.gridWidth],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const draggingLinkPoint = draggingLinkPointRef.current;
      if (draggingLinkPoint) {
        const { linkId, idx } = draggingLinkPoint;
        const link = state.links.find((l) => l.id === linkId);
        if (!link) return;
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const s = scaleRef.current || 1;
        const relX = snapPx((e.clientX - r.left) / s);
        const relY = snapPx((e.clientY - r.top) / s);
        const points = Array.isArray((link as unknown as Record<string, unknown>).points)
          ? (((link as unknown as Record<string, unknown>).points as unknown[]) || [])
              .map((p) => p as { x?: unknown; y?: unknown })
              .map((p) => ({ x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 }))
          : [];
        const next = points.map((p, i) => (i === idx ? { x: relX, y: relY } : p));
        updateLinkDraft(linkId, { points: next } as unknown as Partial<SystemFlowLinkPersisted>);
        return;
      }

      const draggingLinkEndpoint = draggingLinkEndpointRef.current;
      if (draggingLinkEndpoint) {
        const { linkId, end } = draggingLinkEndpoint;
        const link = state.links.find((l) => l.id === linkId);
        if (!link) return;
        const box = byKey.get(end === 'from' ? link.fromKey : link.toKey);
        if (!box) return;
        const rect = boxToRectPx(box);
        const cx = rect.left + rect.w / 2;
        const cy = rect.top + rect.h / 2;

        // Mouse in local container coords
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const s = scaleRef.current || 1;
        const x = (e.clientX - r.left) / s;
        const y = (e.clientY - r.top) / s;

        const dx = x - cx;
        const dy = y - cy;
        const side: SystemFlowSide = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');

        if (end === 'from') updateLinkDraft(linkId, { fromSide: side } as Partial<SystemFlowLinkPersisted>);
        else updateLinkDraft(linkId, { toSide: side } as Partial<SystemFlowLinkPersisted>);
        return;
      }

      const draggingLabel = draggingLinkLabelRef.current;
      if (draggingLabel) {
        const { linkId } = draggingLabel;
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const s = scaleRef.current || 1;
        const x = snapPx((e.clientX - r.left) / s);
        const y = snapPx((e.clientY - r.top) / s);
        updateLinkDraft(linkId, { labelPos: { x, y } } as unknown as Partial<SystemFlowLinkPersisted>);
        return;
      }

      if (draggingKey) {
        const box = byKey.get(draggingKey);
        if (!box || !dragStartRef.current) return;
        const { gx, gy } = pixelToGrid(e.clientX, e.clientY);
        const nextX = clamp(gx, 0, state.gridWidth - box.gridWidth);
        const nextY = clamp(gy, 0, state.gridHeight - box.gridHeight);
        if (!canPlace(draggingKey, { x: nextX, y: nextY, w: box.gridWidth, h: box.gridHeight })) return;
        if (nextX === box.gridX && nextY === box.gridY) return;
        const boxes = state.boxes.map((b) => (b.key === draggingKey ? { ...b, gridX: nextX, gridY: nextY } : b));
        setDraft({ ...state, boxes });
        return;
      }

      if (resizingKey) {
        const box = byKey.get(resizingKey);
        if (!box || !resizeStartRef.current) return;
        const { gx, gy } = pixelToGrid(e.clientX, e.clientY);
        const nextW = clamp(gx - box.gridX + 1, 1, state.gridWidth - box.gridX);
        const nextH = clamp(gy - box.gridY + 1, 1, state.gridHeight - box.gridY);
        const w = Math.max(1, nextW);
        const h = Math.max(1, nextH);
        if (!canPlace(resizingKey, { x: box.gridX, y: box.gridY, w, h })) return;
        if (w === box.gridWidth && h === box.gridHeight) return;
        const boxes = state.boxes.map((b) => (b.key === resizingKey ? { ...b, gridWidth: w, gridHeight: h } : b));
        setDraft({ ...state, boxes });
      }
    };
    const onUp = () => {
      setDraggingKey(null);
      dragStartRef.current = null;
      setResizingKey(null);
      resizeStartRef.current = null;
      draggingLinkPointRef.current = null;
      draggingLinkEndpointRef.current = null;
      draggingLinkLabelRef.current = null;

      if (didMutateDuringInteractionRef.current && draftDuringInteractionRef.current) {
        const next = draftDuringInteractionRef.current;
        didMutateDuringInteractionRef.current = false;
        draftDuringInteractionRef.current = null;
        saveSystemFlowStateToDoc(doc, sfid, next);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [byKey, canPlace, doc, draggingKey, pixelToGrid, resizingKey, setDraft, sfid, state]);

  const onCanvasClick = () => {
    setSelectedBoxKeys([]);
    setSelectedLinkId(null);
    setSelectedZoneId(null);
    setLinkFromKey(null);
    setEditingLinkId(null);
    setEditingLinkDraft('');
  };

  // Escape always deselects so the Steps list is easy to get back to.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onCanvasClick();
      setAnnotationEditForKey(null);
      setAnnotationPopoverPos(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const zonesWithRects = useMemo(() => {
    const out: Array<{ z: SystemFlowZonePersisted; minX: number; minY: number; maxX: number; maxY: number }> = [];
    state.zones.forEach((z) => {
      const boxes = z.boxKeys.map((k) => byKey.get(k)).filter(Boolean) as SystemFlowBoxPersisted[];
      if (!boxes.length) return;
      const minX = Math.min(...boxes.map((b) => b.gridX));
      const minY = Math.min(...boxes.map((b) => b.gridY));
      const maxX = Math.max(...boxes.map((b) => b.gridX + b.gridWidth));
      const maxY = Math.max(...boxes.map((b) => b.gridY + b.gridHeight));
      out.push({ z, minX, minY, maxX, maxY });
    });
    return out;
  }, [byKey, state.zones]);

  const linkPaths = useMemo(() => {
    const paths: Array<{
      id: string;
      d: string;
      label: string;
      labelX: number;
      labelY: number;
      points: Array<{ x: number; y: number }>;
      dashStyle: LinkDashStyle;
      startShape: LinkEndShape;
      endShape: LinkEndShape;
      anchors: { p1: { x: number; y: number }; p3: { x: number; y: number } };
    }> = [];
    // Resolve sides + compute port offsets so multiple links on the same box side don't overlap.
    const endpoints: Array<{
      linkId: string;
      boxKey: string;
      end: 'from' | 'to';
      side: SystemFlowSide;
    }> = [];
    const resolvedSideByLinkId = new Map<string, { fromSide: SystemFlowSide; toSide: SystemFlowSide }>();

    state.links.forEach((l) => {
      const a = byKey.get(l.fromKey);
      const b = byKey.get(l.toKey);
      if (!a || !b) return;
      const computedFrom = autoSide(
        { cx: a.gridX + a.gridWidth / 2, cy: a.gridY + a.gridHeight / 2 },
        { cx: b.gridX + b.gridWidth / 2, cy: b.gridY + b.gridHeight / 2 },
      );
      const computedTo = oppositeSide(computedFrom);
      const fromSide = l.fromSide || computedFrom;
      const toSide = l.toSide || computedTo;
      resolvedSideByLinkId.set(l.id, { fromSide, toSide });
      endpoints.push({ linkId: l.id, boxKey: l.fromKey, end: 'from', side: fromSide });
      endpoints.push({ linkId: l.id, boxKey: l.toKey, end: 'to', side: toSide });
    });

    const groupKey = (boxKey: string, side: SystemFlowSide) => `${boxKey}::${side}`;
    const endpointsByGroup = new Map<string, Array<{ linkId: string; end: 'from' | 'to' }>>();
    endpoints.forEach((e) => {
      const k = groupKey(e.boxKey, e.side);
      const list = endpointsByGroup.get(k) || [];
      list.push({ linkId: e.linkId, end: e.end });
      endpointsByGroup.set(k, list);
    });
    endpointsByGroup.forEach((list, k) => {
      list.sort((a, b) => `${a.linkId}:${a.end}`.localeCompare(`${b.linkId}:${b.end}`));
      endpointsByGroup.set(k, list);
    });

    const portIndex = (boxKey: string, side: SystemFlowSide, linkId: string, end: 'from' | 'to'): { idx: number; count: number } => {
      const list = endpointsByGroup.get(groupKey(boxKey, side)) || [];
      const count = list.length;
      const idx = Math.max(0, list.findIndex((x) => x.linkId === linkId && x.end === end));
      return { idx, count: Math.max(1, count) };
    };

    const anchorWithOffset = (
      rect: { left: number; top: number; w: number; h: number },
      side: SystemFlowSide,
      idx: number,
      count: number,
    ) => {
      const t = (idx + 1) / (count + 1);
      const xSpan = Math.max(0, rect.w - PORT_EDGE_PAD_PX * 2);
      const ySpan = Math.max(0, rect.h - PORT_EDGE_PAD_PX * 2);
      if (side === 'left') return { x: rect.left, y: rect.top + PORT_EDGE_PAD_PX + ySpan * t };
      if (side === 'right') return { x: rect.left + rect.w, y: rect.top + PORT_EDGE_PAD_PX + ySpan * t };
      if (side === 'top') return { x: rect.left + PORT_EDGE_PAD_PX + xSpan * t, y: rect.top };
      return { x: rect.left + PORT_EDGE_PAD_PX + xSpan * t, y: rect.top + rect.h };
    };

    state.links.forEach((l) => {
      const a = byKey.get(l.fromKey);
      const b = byKey.get(l.toKey);
      if (!a || !b) return;

      const aRect = boxToRectPx(a);
      const bRect = boxToRectPx(b);
      const resolved = resolvedSideByLinkId.get(l.id);
      if (!resolved) return;
      const aSide = resolved.fromSide;
      const bSide = resolved.toSide;

      const aPort = portIndex(l.fromKey, aSide, l.id, 'from');
      const bPort = portIndex(l.toKey, bSide, l.id, 'to');

      const p1 = anchorWithOffset(aRect, aSide, aPort.idx, aPort.count);
      const p3 = anchorWithOffset(bRect, bSide, bPort.idx, bPort.count);

      const points: Array<{ x: number; y: number }> = (() => {
        const rec = l as unknown as Record<string, unknown>;
        if (Array.isArray(rec.points)) {
          return (rec.points as unknown[])
            .map((p) => p as { x?: unknown; y?: unknown })
            .map((p) => ({ x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 }));
        }
        // default single elbow (L-shape)
        if (aSide === 'left' || aSide === 'right') return [{ x: (p1.x + p3.x) / 2, y: p1.y }];
        return [{ x: p1.x, y: (p1.y + p3.y) / 2 }];
      })();

      const d = `M ${p1.x} ${p1.y} ` + points.map((p) => `L ${p.x} ${p.y} `).join('') + `L ${p3.x} ${p3.y}`;
      const label = `${typeof l.order === 'number' ? `${l.order}. ` : ''}${l.text || ''}`.trim();
      const last = points.length ? points[points.length - 1] : p1;
      const computedLabelX = (last.x + p3.x) / 2;
      const computedLabelY = (last.y + p3.y) / 2;
      const lp = (l as unknown as Record<string, unknown>).labelPos as { x?: unknown; y?: unknown } | undefined;
      const labelX = typeof lp?.x === 'number' ? (lp.x as number) : computedLabelX;
      const labelY = typeof lp?.y === 'number' ? (lp.y as number) : computedLabelY;
      const dashStyle = ((l as unknown as Record<string, unknown>).dashStyle === 'dashed' ? 'dashed' : 'solid') as LinkDashStyle;
      const startShape = (((l as unknown as Record<string, unknown>).startShape as LinkEndShape) || 'none') as LinkEndShape;
      const endShape = (((l as unknown as Record<string, unknown>).endShape as LinkEndShape) || 'arrow') as LinkEndShape;
      paths.push({ id: l.id, d, label, labelX, labelY, points, dashStyle, startShape, endShape, anchors: { p1, p3 } });
    });
    return paths;
  }, [boxToRectPx, byKey, state.links]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="mac-toolstrip justify-between">
        <div />

        <div className="flex items-center gap-2 text-xs">
          <div className="mac-double-outline px-2 py-1">
            Grid: <span className="font-semibold">{state.gridWidth}</span>×<span className="font-semibold">{state.gridHeight}</span>
          </div>
          <button type="button" className="mac-btn" onClick={() => commitGridSize(+1, 0)} title="Add column">
            +Col
          </button>
          <button type="button" className="mac-btn" onClick={() => commitGridSize(-1, 0)} title="Remove column">
            -Col
          </button>
          <button type="button" className="mac-btn" onClick={() => commitGridSize(0, +1)} title="Add row">
            +Row
          </button>
          <button type="button" className="mac-btn" onClick={() => commitGridSize(0, -1)} title="Remove row">
            -Row
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div
          ref={viewportRef}
          className="absolute inset-0 p-4 overflow-hidden"
          onMouseDown={(e) => {
            // Clicking outside the grid container deselects (brings back Steps list).
            const grid = containerRef.current;
            if (grid && e.target instanceof Node && grid.contains(e.target)) return;
            onCanvasClick();
          }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div
              style={{
                width: gridPixelSize.w * scale,
                height: gridPixelSize.h * scale,
              }}
            >
              <div
                ref={containerRef}
                className="relative rounded-md border border-slate-200 bg-white"
                style={{
                  width: gridPixelSize.w,
                  height: gridPixelSize.h,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  backgroundSize: `${CELL_PX + GAP_PX}px ${CELL_PX + GAP_PX}px`,
                  backgroundImage:
                    'linear-gradient(to right, rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.25) 1px, transparent 1px)',
                }}
                onMouseMove={(e) => {
                  if (!presence) return;
                  const el = containerRef.current;
                  if (!el) return;
                  const r = el.getBoundingClientRect();
                  const s = scaleRef.current || 1;
                  // Cursor is stored in unscaled grid pixel space so it can be rendered inside this scaled container.
                  const x = (e.clientX - r.left) / s;
                  const y = (e.clientY - r.top) / s;
                  presence.setCursor({ x, y });
                }}
                onMouseLeave={() => {
                  if (presence) presence.setCursor(null);
                }}
                onMouseDown={(e) => {
                  // Clicking empty grid area should deselect (show Steps).
                  // Boxes/links/handles stopPropagation on their own handlers, but we also guard
                  // against any nested interactive elements inside the container.
                  const t = e.target as unknown;
                  if (t && typeof t === 'object' && 'closest' in (t as any)) {
                    const el = t as HTMLElement;
                    if (el.closest('[data-sf-interactive="1"]')) return;
                  }
                  onCanvasClick();
                }}
                onClick={(e) => {
                  // Prevent any bubbling click from clearing selection after a box/link mouseDown selects it.
                  e.stopPropagation();
                }}
              >
                {/* Multiplayer cursors (render in container space; scale transform applies automatically) */}
                {presence?.peers?.length ? (
                  <div className="pointer-events-none absolute inset-0 z-50">
                    {presence.peers
                      .filter((p) => p.state?.view === 'systemFlow' && p.state?.cursor)
                      .map((p) => {
                        const c = p.state.cursor!;
                        return (
                          <div key={`sf-cursor-${p.clientId}`} className="absolute" style={{ left: c.x, top: c.y }}>
                            <div className="w-3 h-3 border border-black bg-white mac-shadow-hard" />
                            <div
                              className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] mac-double-outline ${p.state.user.badgeClass}`}
                            >
                              <span className="font-semibold">{p.state.user.name}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : null}
            {/* Zones (render under boxes) */}
            {zonesWithRects.map(({ z, minX, minY, maxX, maxY }) => {
              const { left, top } = gridToPx(minX, minY);
              const w = (maxX - minX) * CELL_PX + Math.max(0, maxX - minX - 1) * GAP_PX;
              const h = (maxY - minY) * CELL_PX + Math.max(0, maxY - minY - 1) * GAP_PX;
              const padded = {
                left: left - ZONE_PAD_PX,
                top: top - ZONE_PAD_PX,
                width: w + ZONE_PAD_PX * 2,
                height: h + ZONE_PAD_PX * 2,
              };
              const style = (z.outlineStyle || 'solid') as 'solid' | 'dashed' | 'dotted' | 'double';
              return (
                <div key={z.id}>
                  {style === 'double' ? (
                    <>
                      <div
                        className="absolute rounded-md pointer-events-none"
                        style={{
                          left: padded.left,
                          top: padded.top,
                          width: padded.width,
                          height: padded.height,
                          border: '2px solid #000',
                          background: 'transparent',
                          zIndex: 0,
                        }}
                      />
                      <div
                        className="absolute rounded-md pointer-events-none"
                        style={{
                          left: padded.left + 4,
                          top: padded.top + 4,
                          width: Math.max(0, padded.width - 8),
                          height: Math.max(0, padded.height - 8),
                          border: '2px solid #000',
                          background: 'transparent',
                          zIndex: 0,
                        }}
                      />
                    </>
                  ) : (
                    <div
                      className="absolute rounded-md pointer-events-none"
                      style={{
                        left: padded.left,
                        top: padded.top,
                        width: padded.width,
                        height: padded.height,
                        border: `2px ${style} #000`,
                        background: 'transparent',
                        zIndex: 0,
                      }}
                    />
                  )}
                  <div
                    className="absolute px-2 py-0.5 bg-white text-black text-[10px] font-semibold border border-black mac-shadow-hard"
                    style={{
                      left: padded.left + 8,
                      top: padded.top + 8,
                      zIndex: 50,
                    }}
                  >
                    <button
                      type="button"
                      className="text-left"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setSelectedZoneId(z.id);
                        setSelectedBoxKeys([]);
                        setSelectedLinkId(null);
                      }}
                      title="Select zone"
                    >
                      {z.name || 'Zone'}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Links (SVG overlay) */}
            <svg className="absolute inset-0" width={gridPixelSize.w} height={gridPixelSize.h}>
              <defs>
                <marker id="sf-arrow" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#000000" />
                </marker>
                <marker id="sf-circle" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                  <circle cx="5" cy="5" r="3.2" fill="#ffffff" stroke="#0f172a" strokeWidth="1.6" />
                </marker>
                <marker id="sf-square" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                  <rect x="2.2" y="2.2" width="5.6" height="5.6" fill="#ffffff" stroke="#0f172a" strokeWidth="1.6" />
                </marker>
              </defs>
              {linkPaths.map((p) => {
                const selected = selectedLinkId === p.id;
                const markerFor = (shape: LinkEndShape): string | undefined => {
                  if (shape === 'arrow') return 'url(#sf-arrow)';
                  if (shape === 'circle') return 'url(#sf-circle)';
                  if (shape === 'square') return 'url(#sf-square)';
                  return undefined;
                };
                return (
                  <g key={p.id}>
                    <path
                      d={p.d}
                      fill="none"
                      stroke="#000000"
                      strokeWidth={2}
                      strokeDasharray={p.dashStyle === 'dashed' ? '6 4' : undefined}
                      markerStart={markerFor(p.startShape)}
                      markerEnd={markerFor(p.endShape)}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedLinkId(p.id);
                        setSelectedBoxKeys([]);
                        setSelectedZoneId(null);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        // Direct edit on-canvas:
                        // - Double click edits the label
                        // - Shift+double click adds a bend point exactly at the click
                        if (e.shiftKey) {
                          const el = containerRef.current;
                          if (!el) return;
                          const r = el.getBoundingClientRect();
                          const s = scaleRef.current || 1;
                          const x = (e.clientX - r.left) / s;
                          const y = (e.clientY - r.top) / s;

                          const link = state.links.find((l) => l.id === p.id);
                          if (!link) return;
                          const rec = link as unknown as Record<string, unknown>;
                          const existing = Array.isArray(rec.points)
                            ? (rec.points as unknown[])
                                .map((pt) => pt as Record<string, unknown>)
                                .map((pt) => ({ x: typeof pt.x === 'number' ? pt.x : 0, y: typeof pt.y === 'number' ? pt.y : 0 }))
                            : [];
                          commitLinkUpdate(p.id, { points: [...existing, { x, y }] } as unknown as Partial<SystemFlowLinkPersisted>);
                        } else {
                          const link = state.links.find((l) => l.id === p.id);
                          setEditingLinkId(p.id);
                          setEditingLinkDraft(link?.text || '');
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    {p.label ? (() => {
                      const m = measureLabel(p.label);
                      const x = p.labelX - m.w / 2;
                      const y = p.labelY - m.h / 2;
                      return (
                        <g
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDownCapture={(e) => {
                            // Drag to reposition label (snap to grid)
                            e.stopPropagation();
                            e.preventDefault();
                            setSelectedLinkId(p.id);
                            draggingLinkLabelRef.current = { linkId: p.id };
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            const link = state.links.find((l) => l.id === p.id);
                            setSelectedLinkId(p.id);
                            setSelectedZoneId(null);
                            setEditingLinkId(p.id);
                            setEditingLinkDraft(link?.text || '');
                          }}
                          style={{ cursor: 'move' }}
                        >
                          <rect x={x} y={y} width={m.w} height={m.h} fill="#ffffff" stroke="#000000" strokeWidth={1.5} rx={0} ry={0} />
                          <text
                            x={p.labelX}
                            y={p.labelY + 3}
                            fontSize={11}
                            fontWeight={600}
                            textAnchor="middle"
                            fill="#000000"
                            style={{ userSelect: 'none' }}
                          >
                            {p.label}
                          </text>
                        </g>
                      );
                    })() : null}

                    {/* Handles (when selected): endpoints + bend points */}
                    {selected ? (
                      <>
                        {/* endpoint handles: drag to choose which side */}
                        <circle
                          cx={p.anchors.p1.x}
                          cy={p.anchors.p1.y}
                          r={7}
                          fill="#ffffff"
                          stroke="#000000"
                          strokeWidth={2}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            draggingLinkEndpointRef.current = { linkId: p.id, end: 'from' };
                          }}
                          style={{ cursor: 'grab' }}
                        />
                        <circle
                          cx={p.anchors.p3.x}
                          cy={p.anchors.p3.y}
                          r={7}
                          fill="#ffffff"
                          stroke="#000000"
                          strokeWidth={2}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            draggingLinkEndpointRef.current = { linkId: p.id, end: 'to' };
                          }}
                          style={{ cursor: 'grab' }}
                        />

                        {/* bend points: always show at least 1 default elbow, draggable */}
                        {p.points.map((pt, idx) => (
                          <circle
                            key={`${p.id}:${idx}`}
                            cx={pt.x}
                            cy={pt.y}
                            r={CONTROL_POINT_R}
                            fill="#ffffff"
                            stroke="#000000"
                            strokeWidth={2}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              draggingLinkPointRef.current = { linkId: p.id, idx };
                            }}
                            style={{ cursor: 'move' }}
                          />
                        ))}
                      </>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {/* Boxes */}
            {state.boxes.map((b) => {
              const rect = boxToRectPx(b);
              const isSelected = selectedBoxKeys.includes(b.key);
              const title = b.dataObjectId ? `${b.name} (→ ${b.dataObjectId})` : b.name;
              const targetKey = buildSystemFlowBoxCommentTargetKey(sfid, b.key);
              const thread = getThread(doc, targetKey);
              const commentCount = thread ? 1 + (thread.replies?.length || 0) : 0;
              const hasComment = !!thread;
              return (
                <div
                  key={b.key}
                  className={`absolute rounded-md border mac-shadow-hard select-none ${
                    isSelected ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
                  }`}
                  style={{ left: rect.left, top: rect.top, width: rect.w, height: rect.h, zIndex: 10 }}
                  data-sf-interactive="1"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    // selection and drag start
                    handleClickBox(b.key, e);
                    if (mode !== 'select') return;
                    if (e.button !== 0) return;
                    setDraggingKey(b.key);
                    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY, startX: b.gridX, startY: b.gridY };
                  }}
                  title={title}
                >
                  {/* Comment bubble */}
                  {showComments && (hasComment || activeTool === 'comment') ? (
                    <button
                      type="button"
                      className="absolute -right-2 -top-2 h-6 min-w-6 px-1.5 rounded-full bg-black text-white text-[11px] shadow-sm z-30"
                      title={hasComment ? 'Open comment' : 'Add comment'}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenComments?.({
                          targetKey,
                          targetLabel: `${b.name || b.key}`,
                          ...(thread ? { scrollToThreadId: thread.id } : {}),
                        });
                      }}
                      data-sf-interactive="1"
                    >
                      {hasComment ? commentCount : '+'}
                    </button>
                  ) : null}

                  <div className="p-2 h-full flex flex-col gap-1 overflow-hidden">
                    <div className="flex flex-col items-center justify-center gap-1 min-w-0 flex-1">
                      <div className="text-2xl leading-none">{b.icon || '⬛︎'}</div>
                      <div className="text-[12px] font-semibold text-slate-900 text-center break-words whitespace-pre-wrap leading-snug">
                        {b.name}
                      </div>
                    </div>
                    {b.dataObjectId ? <div className="text-[10px] text-slate-500 truncate">→ {b.dataObjectId}</div> : null}
                  </div>

                  {/* Annotation display + editor trigger */}
                  {showAnnotations && b.annotation && b.annotation.trim() ? (
                    <div
                      className="absolute left-0 top-full mt-2 w-full"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeTool !== 'annotation') return;
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        setAnnotationEditForKey(b.key);
                        setAnnotationDraft((b.annotation || '').toString());
                        setAnnotationPopoverPos({ x: rect.right + 8, y: rect.top });
                      }}
                      data-sf-interactive="1"
                    >
                      <div className="rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm">
                        <div className="text-[11px] text-slate-700 whitespace-pre-wrap break-words">{b.annotation}</div>
                      </div>
                    </div>
                  ) : null}

                  {/* Resize handle */}
                  <button
                    type="button"
                    className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize bg-transparent"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (mode !== 'select') return;
                      setResizingKey(b.key);
                      resizeStartRef.current = { clientX: e.clientX, clientY: e.clientY, startW: b.gridWidth, startH: b.gridHeight };
                    }}
                    title="Resize"
                  />
                </div>
              );
            })}

            {/* Annotation popover (fixed) */}
            {annotationEditForKey && annotationPopoverPos ? (
              <div
                className="fixed z-[9999] w-[320px] rounded-lg border border-slate-200 bg-white shadow-xl p-3"
                style={{ left: annotationPopoverPos.x, top: annotationPopoverPos.y }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                data-sf-interactive="1"
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">System flow annotation</div>
                <textarea
                  value={annotationDraft}
                  onChange={(e) => setAnnotationDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Write an annotation…"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      saveBoxAnnotation(annotationEditForKey, '');
                      setAnnotationEditForKey(null);
                      setAnnotationPopoverPos(null);
                    }}
                    title="Delete annotation"
                  >
                    Delete
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-7 px-2 rounded-md border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setAnnotationEditForKey(null);
                        setAnnotationPopoverPos(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="h-7 px-2 rounded-md bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700"
                      onClick={() => {
                        saveBoxAnnotation(annotationEditForKey, annotationDraft);
                        setAnnotationEditForKey(null);
                        setAnnotationPopoverPos(null);
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Inline link label editor (on-canvas) */}
            {editingLinkId ? (
              (() => {
                const p = linkPaths.find((x) => x.id === editingLinkId) || null;
                if (!p) return null;
                const left = clamp(p.labelX - 120, 0, Math.max(0, gridPixelSize.w - 240));
                const top = clamp(p.labelY - 14, 0, Math.max(0, gridPixelSize.h - 28));
                return (
                  <div
                    className="absolute"
                    style={{ left, top, width: 240, height: 28, zIndex: 100 }}
                    data-sf-interactive="1"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      value={editingLinkDraft}
                      onChange={(e) => setEditingLinkDraft(e.target.value)}
                      className="mac-field w-full"
                      style={{ borderRadius: 0, paddingLeft: 6, paddingRight: 6, height: 28 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitLinkUpdate(editingLinkId, { text: editingLinkDraft });
                          setEditingLinkId(null);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingLinkId(null);
                        }
                      }}
                      onBlur={() => {
                        commitLinkUpdate(editingLinkId, { text: editingLinkDraft });
                        setEditingLinkId(null);
                      }}
                    />
                  </div>
                );
              })()
            ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Floating right panel (compact) */}
        <div className="absolute right-4 top-4 pointer-events-none">
          <div
            className="mac-window w-[260px] overflow-hidden pointer-events-auto"
            data-safe-panel="right"
            data-safe-panel-view="systemFlow"
          >
            <div className="mac-titlebar">
              <div className="mac-title">
                {selectedBox ? 'Box' : selectedLink ? 'Link' : selectedZone ? 'Zone' : steps.length ? 'Steps' : 'System Flow'}
              </div>
            </div>
            <div className="p-3 overflow-auto" style={{ maxHeight: selectedBox || selectedLink ? '70vh' : '240px' }}>
              {mode === 'link' ? (
                <div className="text-xs text-slate-600">
                  Click a <span className="font-semibold">source</span> box, then a <span className="font-semibold">target</span> box to create an L-shaped link.
                </div>
              ) : null}

              {selectedBox ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                    <input
                      value={selectedBox.name}
                      onChange={(e) => commitBoxUpdate(selectedBox.key, { name: e.target.value })}
                      className="mac-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Icon</label>
                    <input
                      value={selectedBox.icon || ''}
                      onChange={(e) => commitBoxUpdate(selectedBox.key, { icon: e.target.value })}
                      className="mac-field w-full"
                      placeholder="e.g. 🔒"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Linked data object</label>
                    <DataObjectSearchSelect
                      value={selectedBox.dataObjectId || ''}
                      onChange={(nextId) => {
                        commitBoxUpdate(selectedBox.key, {
                          dataObjectId: nextId || undefined,
                          dataObjectAttributeIds: nextId ? selectedBox.dataObjectAttributeIds : undefined,
                        });
                      }}
                      objects={dataObjectOptions}
                      placeholder="None"
                      includeNoneOption
                      noneLabel="None"
                    />
                    {selectedBox.dataObjectId ? (
                      <DataObjectAttributeMultiSelect
                        objectId={selectedBox.dataObjectId}
                        objects={dataStore.objects}
                        value={selectedBox.dataObjectAttributeIds || []}
                        onChange={(next) => commitBoxUpdate(selectedBox.key, { dataObjectAttributeIds: next })}
                      />
                    ) : null}
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-700 mb-1">Templates</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="mac-btn"
                        disabled={!onSaveTemplateFile}
                        title={!onSaveTemplateFile ? 'Template actions are not available.' : 'Save this box as a reusable template.'}
                        onClick={async () => {
                          if (!onSaveTemplateFile) return;
                          const frag: SystemFlowBoxTemplateV1 = {
                            version: 1,
                            name: selectedBox.name || 'Box',
                            icon: selectedBox.icon,
                            color: selectedBox.color,
                            annotation: selectedBox.annotation,
                            dataObjectId: selectedBox.dataObjectId,
                            dataObjectAttributeIds: selectedBox.dataObjectAttributeIds,
                            gridWidth: selectedBox.gridWidth,
                            gridHeight: selectedBox.gridHeight,
                          };
                          const payload = ['```nexus-systemflow-box', JSON.stringify(frag, null, 2), '```', ''].join('\n');
                          const headerBase: Omit<NexusTemplateHeader, 'name'> = {
                            version: 1,
                            ...(templateSourceLabel ? { description: `Saved from ${templateSourceLabel}` } : {}),
                            targetKind: 'diagram',
                            mode: 'appendFragment',
                            fragmentKind: 'systemFlowBox',
                            tags: ['systemFlow'],
                          };
                          setPendingTemplatePayload(payload);
                          setPendingTemplateHeaderBase(headerBase);
                          setPendingTemplateDefaultName(frag.name);
                          setSaveTemplateOpen(true);
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="mac-btn"
                        disabled={!templateFiles || !loadTemplateMarkdown || (templateFiles || []).length === 0}
                        title={(templateFiles || []).length === 0 ? 'No templates yet.' : 'Insert a box template.'}
                        onClick={() => setInsertFromTemplateOpen(true)}
                      >
                        Insert…
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedLink ? (
                <div className="space-y-3">
                  <div className="text-xs text-slate-600">
                    <div>
                      <span className="font-semibold">From</span>: {selectedLink.fromKey}
                    </div>
                    <div>
                      <span className="font-semibold">To</span>: {selectedLink.toKey}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Step order (optional)</label>
                    <input
                      type="number"
                      value={typeof selectedLink.order === 'number' ? String(selectedLink.order) : ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const n = raw ? Number(raw) : NaN;
                        commitLinkUpdate(selectedLink.id, { order: Number.isFinite(n) ? n : undefined });
                      }}
                      className="mac-field w-full"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Line text</label>
                    <input
                      value={selectedLink.text || ''}
                      onChange={(e) => commitLinkUpdate(selectedLink.id, { text: e.target.value })}
                      className="mac-field w-full"
                      placeholder="e.g. Validate → Persist → Notify"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">From side</label>
                      <select
                        value={selectedLink.fromSide || ''}
                        onChange={(e) => commitLinkUpdate(selectedLink.id, { fromSide: (e.target.value || undefined) as SystemFlowSide | undefined })}
                        className="mac-field w-full"
                      >
                        <option value="">Auto</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">To side</label>
                      <select
                        value={selectedLink.toSide || ''}
                        onChange={(e) => commitLinkUpdate(selectedLink.id, { toSide: (e.target.value || undefined) as SystemFlowSide | undefined })}
                        className="mac-field w-full"
                      >
                        <option value="">Auto</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Dash</label>
                      <select
                        value={((selectedLink as unknown as Record<string, unknown>).dashStyle as string) || 'solid'}
                        onChange={(e) => commitLinkUpdate(selectedLink.id, { dashStyle: e.target.value as LinkDashStyle } as unknown as Partial<SystemFlowLinkPersisted>)}
                        className="mac-field w-full"
                      >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">End shape</label>
                      <select
                        value={((selectedLink as unknown as Record<string, unknown>).endShape as string) || 'arrow'}
                        onChange={(e) => commitLinkUpdate(selectedLink.id, { endShape: e.target.value as LinkEndShape } as unknown as Partial<SystemFlowLinkPersisted>)}
                        className="mac-field w-full"
                      >
                        <option value="none">None</option>
                        <option value="arrow">Arrow</option>
                        <option value="circle">Circle</option>
                        <option value="square">Square</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="mac-btn"
                      onClick={() => {
                        const rec = selectedLink as unknown as Record<string, unknown>;
                        const pts = Array.isArray(rec.points)
                          ? (rec.points as unknown[]).map((p) => p as { x?: unknown; y?: unknown }).map((p) => ({ x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 }))
                          : [];
                        // Add a new bend roughly at the midpoint between endpoints (or near the last bend).
                        const a = byKey.get(selectedLink.fromKey);
                        const b = byKey.get(selectedLink.toKey);
                        if (!a || !b) return;
                        const aRect = boxToRectPx(a);
                        const bRect = boxToRectPx(b);
                        const aSide = selectedLink.fromSide || autoSide({ cx: a.gridX + a.gridWidth / 2, cy: a.gridY + a.gridHeight / 2 }, { cx: b.gridX + b.gridWidth / 2, cy: b.gridY + b.gridHeight / 2 });
                        const bSide = selectedLink.toSide || oppositeSide(aSide);
                        const anchor = (rect: { left: number; top: number; w: number; h: number }, side: SystemFlowSide) => {
                          if (side === 'left') return { x: rect.left, y: rect.top + rect.h / 2 };
                          if (side === 'right') return { x: rect.left + rect.w, y: rect.top + rect.h / 2 };
                          if (side === 'top') return { x: rect.left + rect.w / 2, y: rect.top };
                          return { x: rect.left + rect.w / 2, y: rect.top + rect.h };
                        };
                        const p1 = anchor(aRect, aSide);
                        const p3 = anchor(bRect, bSide);
                        const mid = pts.length ? pts[pts.length - 1] : { x: (p1.x + p3.x) / 2, y: (p1.y + p3.y) / 2 };
                        const next = [...pts, { x: (mid.x + p3.x) / 2, y: (mid.y + p3.y) / 2 }];
                        commitLinkUpdate(selectedLink.id, { points: next } as unknown as Partial<SystemFlowLinkPersisted>);
                      }}
                      title="Add bend point (then drag points on canvas)"
                    >
                      + Bend
                    </button>
                    <button
                      type="button"
                      className="mac-btn"
                      onClick={() => commitLinkUpdate(selectedLink.id, { points: undefined } as unknown as Partial<SystemFlowLinkPersisted>)}
                      title="Reset bends back to default L"
                    >
                      Reset bends
                    </button>
                  </div>
                </div>
              ) : selectedZone ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Zone name</label>
                    <input
                      value={selectedZone.name || ''}
                      onChange={(e) => {
                        const nextName = e.target.value;
                        persist({
                          ...state,
                          zones: state.zones.map((z) => (z.id === selectedZone.id ? { ...z, name: nextName } : z)),
                        });
                      }}
                      className="mac-field w-full"
                      placeholder="Zone"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Outline style</label>
                    <select
                      value={selectedZone.outlineStyle || 'solid'}
                      onChange={(e) => {
                        const outlineStyle = (e.target.value || 'solid') as SystemFlowZonePersisted['outlineStyle'];
                        persist({
                          ...state,
                          zones: state.zones.map((z) => (z.id === selectedZone.id ? { ...z, outlineStyle } : z)),
                        });
                      }}
                      className="mac-field w-full"
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                      <option value="double">Double</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-600">
                  {selectedBoxKeys.length > 1 ? (
                    <div>
                      Selected boxes: <span className="font-semibold">{selectedBoxKeys.length}</span>
                    </div>
                  ) : steps.length ? (
                    <div className="space-y-2">
                      {steps.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          className="w-full text-left px-2 py-1 border border-black bg-white hover:bg-slate-50"
                          onClick={() => {
                            setSelectedLinkId(l.id);
                            setSelectedBoxKeys([]);
                            setSelectedZoneId(null);
                          }}
                        >
                          <div className="font-semibold">Step {l.order}</div>
                          <div className="opacity-80 truncate">{l.text || '(no label)'}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div>Select a box or a link…</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <InsertFromTemplateModal
          open={insertFromTemplateOpen}
          title="Insert system flow box"
          files={templateFiles || []}
          loadMarkdown={loadTemplateMarkdown || (async () => '')}
          accept={{ targetKind: 'diagram', mode: 'appendFragment', fragmentKind: 'systemFlowBox' }}
          scope={
            templateScope && onTemplateScopeChange
              ? {
                  value: templateScope,
                  options: [
                    { id: 'project', label: 'This project' },
                    { id: 'account', label: 'Account' },
                    ...(globalTemplatesEnabled ? [{ id: 'global', label: 'Global' }] : []),
                  ],
                  onChange: (next) => onTemplateScopeChange(next as any),
                }
              : undefined
          }
          onClose={() => setInsertFromTemplateOpen(false)}
          onInsert={async ({ content }) => {
            const tpl = parseSystemFlowBoxTemplate(content);
            insertBoxFromTemplate(tpl);
          }}
        />

        <SaveTemplateModal
          open={saveTemplateOpen}
          title="Save template"
          defaultName={pendingTemplateDefaultName}
          defaultScope="project"
          onClose={() => setSaveTemplateOpen(false)}
          onSave={async ({ name, scope }) => {
            if (!onSaveTemplateFile) throw new Error('Template saving unavailable.');
            if (!pendingTemplatePayload || !pendingTemplateHeaderBase) throw new Error('No template content to save.');
            const header: NexusTemplateHeader = { ...pendingTemplateHeaderBase, name };
            const content = upsertTemplateHeader(pendingTemplatePayload, header);
            await onSaveTemplateFile({ name, content, scope });
            setPendingTemplatePayload(null);
            setPendingTemplateHeaderBase(null);
          }}
        />
      </div>
    </div>
  );
}

