'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor as TldrawEditor } from 'tldraw';
import {
  ArrowLeft,
  Layers,
  Paintbrush,
  PenLine,
  RectangleHorizontal,
  Circle,
  Type,
  Sparkles,
  BringToFront,
  SendToBack,
  Group,
  Ungroup,
} from 'lucide-react';
import type { VisionCellV1, VisionCellKind } from '@/lib/visionjson';
import { FabricCanvas, type FabricCanvasApi } from '@/components/vision/fabric/FabricCanvas';
import {
  applyBlur,
  applyLinearGradientFill,
  bringForward,
  bringToFront,
  booleanOpSelection,
  enterBooleanEdit,
  recomputeBooleanFromSelection,
  finishBooleanEdit,
  groupSelection,
  sendBackward,
  sendToBack,
  toggleVisible,
  setLocked,
  renameLayer,
  moveLayer,
  moveLayerTo,
  nestIntoGroup,
  unnestFromGroup,
  setFill,
  setFontFamily,
  setFontSize,
  setPenMode,
  setSelectMode,
  setStroke,
  setStrokeWidth,
  ungroup,
} from '@/components/vision/fabric/tools';
import { loadGoogleFonts } from '@/lib/google-fonts';
import { uploadVisionImage, createSignedVisionAssetUrl } from '@/lib/vision-assets-supabase';
import { VisionMonitoringPanel } from '@/components/vision/VisionMonitoringPanel';
import { buildLayerTree, flattenLayerTree, type LayerTreeNode } from '@/components/vision/layers/layerTree';
import { TldrawTileEditor } from '@/components/vision/tldraw/TldrawTileEditor';
import { TldrawLayersPanel } from '@/components/vision/tldraw/TldrawLayersPanel';
import { TldrawOverlayPanel } from '@/components/vision/tldraw/ui/TldrawOverlayPanel';

type Tool = 'select' | 'pen' | 'rect' | 'ellipse' | 'line' | 'text';

export function VisionTileEditor({
  fileId,
  cellKey,
  cell,
  onClose,
  onUpdateCell,
  supabaseMode,
  supabase,
  userId,
}: {
  fileId: string;
  cellKey: string;
  cell: VisionCellV1;
  onClose: () => void;
  onUpdateCell: (next: VisionCellV1) => void;
  supabaseMode: boolean;
  supabase: SupabaseClient | null;
  userId: string | null;
}) {
  const kind: VisionCellKind = cell.kind;
  const MAX_THUMB_CHARS = 60_000;

  // Default UX:
  // - vector/ui: pen first (so click-drag draws immediately)
  // - image: select first (upload + annotate)
  const [tool, setTool] = useState<Tool>(() => (kind === 'image' ? 'select' : 'pen'));
  const [fill, setFillColor] = useState('#111111');
  const [stroke, setStrokeColor] = useState('#111111');
  const [strokeWidth, setStrokeWidthUi] = useState(2);
  const [penWidth, setPenWidth] = useState(2);
  const [penColor, setPenColor] = useState('#111111');
  const [grad1, setGrad1] = useState('#ff6a00');
  const [grad2, setGrad2] = useState('#1a73e8');
  const [blurAmount, setBlurAmount] = useState(0);

  const [fontFamily, setFontFamilyUi] = useState('Inter');
  const [fontSize, setFontSizeUi] = useState(28);

  const apiRef = useRef<FabricCanvasApi | null>(null);
  const [canvasApi, setCanvasApi] = useState<FabricCanvasApi | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);
  const [activeBooleanId, setActiveBooleanId] = useState<string | null>(null);
  const [isEditingBoolean, setIsEditingBoolean] = useState(false);
  const [layersTreeOpen, setLayersTreeOpen] = useState<Record<string, boolean>>({});
  const [layersRev, setLayersRev] = useState(0);
  const [activeLayerIds, setActiveLayerIds] = useState<string[]>([]);
  const latestCellRef = useRef(cell);
  const booleanRecomputeTimerRef = useRef<number | null>(null);
  const booleanRecomputingRef = useRef(false);
  const dragLayerIdRef = useRef<string | null>(null);
  const [dropTargetLayerId, setDropTargetLayerId] = useState<string | null>(null);
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [tldrawEditor, setTldrawEditor] = useState<TldrawEditor | null>(null);
  const tldrawHostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    tool: Tool;
    startX: number;
    startY: number;
    obj: any;
  } | null>(null);

  // Thumbnails are generated on debounce (not every mousemove).
  const thumbTimerRef = useRef<number | null>(null);

  const canvasSize = 768;

  useEffect(() => {
    latestCellRef.current = cell;
  }, [cell]);

  const updateCellSafe = (patch: Partial<VisionCellV1>) => {
    const base = latestCellRef.current;
    const next: VisionCellV1 = { ...base, ...patch, updatedAt: new Date().toISOString() };
    latestCellRef.current = next;
    onUpdateCell(next);
  };


  const scheduleThumbWrite = () => {
    if (thumbTimerRef.current) window.clearTimeout(thumbTimerRef.current);
    thumbTimerRef.current = window.setTimeout(() => {
      thumbTimerRef.current = null;
      const api = apiRef.current;
      if (!api) return;
      const thumb = api.exportThumb(24);
      if (!thumb) return;
      // IMPORTANT: use latest cell to avoid reverting Fabric JSON.
      updateCellSafe({ thumb });
    }, 650);
  };

  useEffect(() => {
    return () => {
      if (thumbTimerRef.current) window.clearTimeout(thumbTimerRef.current);
      thumbTimerRef.current = null;
    };
  }, []);

  // Keep canvas mode in sync with tool.
  useEffect(() => {
    const api = canvasApi || apiRef.current;
    if (!api) return;
    if (tool === 'pen') setPenMode(api.canvas, api.fabric, { color: penColor, width: penWidth });
    else setSelectMode(api.canvas);
  }, [canvasApi, tool, penColor, penWidth]);

  // Track which boolean bundle (if any) is selected.
  useEffect(() => {
    const api = canvasApi || apiRef.current;
    if (!api) return;
    const canvas = api.canvas;

    const readActive = () => {
      try {
        const activeObjs = (typeof canvas.getActiveObjects === 'function' ? canvas.getActiveObjects() : []) || [];
        const primary = canvas.getActiveObject?.() || null;
        const ids = (Array.isArray(activeObjs) ? activeObjs : [])
          .map((o: any) => (typeof o?.data?.layerId === 'string' ? String(o.data.layerId) : null))
          .filter(Boolean) as string[];
        setActiveLayerIds(ids);

        // Prefer boolean id from active object; ignore activeSelection wrapper.
        const bId = typeof primary?.data?.boolean?.id === 'string' ? String(primary.data.boolean.id) : null;
        if (bId) setActiveBooleanId(bId);
        else if (!isEditingBoolean) setActiveBooleanId(null);
        if (!bId && !isEditingBoolean) setIsEditingBoolean(false);
      } catch {
        if (!isEditingBoolean) {
          setActiveBooleanId(null);
          setIsEditingBoolean(false);
        }
        setActiveLayerIds([]);
      }
    };

    const onCleared = () => {
      if (!isEditingBoolean) {
        setActiveBooleanId(null);
        setIsEditingBoolean(false);
      }
      setActiveLayerIds([]);
    };

    canvas.on('selection:created', readActive);
    canvas.on('selection:updated', readActive);
    canvas.on('selection:cleared', onCleared);
    canvas.on('object:modified', readActive);
    return () => {
      try {
        canvas.off('selection:created', readActive);
        canvas.off('selection:updated', readActive);
        canvas.off('selection:cleared', onCleared);
        canvas.off('object:modified', readActive);
      } catch {
        // ignore
      }
    };
  }, [canvasApi, isEditingBoolean]);

  // Drag-to-create tools (rect/ellipse/line/text).
  useEffect(() => {
    const api = canvasApi || apiRef.current;
    if (!api) return;
    const canvas = api.canvas;
    const fabric = api.fabric;

    const isDrawTool = tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'text';

    const getClientXY = (e: any): { clientX: number; clientY: number } | null => {
      if (!e) return null;
      // TouchEvent
      const t = e.touches?.[0] || e.changedTouches?.[0] || null;
      if (t && typeof t.clientX === 'number' && typeof t.clientY === 'number') return { clientX: t.clientX, clientY: t.clientY };
      // MouseEvent / PointerEvent
      if (typeof e.clientX === 'number' && typeof e.clientY === 'number') return { clientX: e.clientX, clientY: e.clientY };
      return null;
    };

    const getPointer = (opt: any) => {
      // Fabric's cached offsets can go stale inside scroll/overflow/modal layouts.
      // Recalc right before reading pointer so drag tools don't jump to (0,0).
      try {
        canvas.calcOffset?.();
      } catch {
        // ignore
      }

      // Prefer Fabric-provided pointer if available.
      const p0 = opt?.pointer || opt?.absolutePointer;
      if (p0 && Number.isFinite(p0.x) && Number.isFinite(p0.y)) return { x: Number(p0.x), y: Number(p0.y) };

      // Next: ask Fabric to compute from the native event.
      const e = opt?.e;
      try {
        const p1 = canvas.getPointer?.(e, true) ?? canvas.getPointer?.(e);
        if (p1 && Number.isFinite(p1.x) && Number.isFinite(p1.y)) return { x: Number(p1.x), y: Number(p1.y) };
      } catch {
        // ignore
      }

      // Final fallback: manual rect mapping (CSS pixels -> canvas coords).
      try {
        const el: any = canvas.upperCanvasEl || canvas.lowerCanvasEl || canvas.getElement?.();
        const rect = el?.getBoundingClientRect?.();
        const xy = getClientXY(e);
        if (rect && xy) {
          const cw = Number(canvas.getWidth?.() ?? 0) || 1;
          const ch = Number(canvas.getHeight?.() ?? 0) || 1;
          const sx = rect.width ? cw / rect.width : 1;
          const sy = rect.height ? ch / rect.height : 1;
          return { x: (xy.clientX - rect.left) * sx, y: (xy.clientY - rect.top) * sy };
        }
      } catch {
        // ignore
      }

      return { x: 0, y: 0 };
    };

    const onDown = (opt: any) => {
      if (!isDrawTool) return;
      // Do not start drawing on right-click.
      if (opt?.e?.button === 2) return;

      const { x, y } = getPointer(opt);
      dragRef.current = null;

      canvas.discardActiveObject?.();
      canvas.selection = false;

      if (tool === 'rect') {
        const rect = new fabric.Rect({
          left: x,
          top: y,
          width: 1,
          height: 1,
          fill,
          stroke,
          strokeWidth,
          selectable: false,
          evented: false,
          originX: 'left',
          originY: 'top',
        });
        canvas.add(rect);
        dragRef.current = { tool, startX: x, startY: y, obj: rect };
        canvas.requestRenderAll();
        return;
      }

      if (tool === 'ellipse') {
        const ell = new fabric.Ellipse({
          left: x,
          top: y,
          rx: 1,
          ry: 1,
          fill,
          stroke,
          strokeWidth,
          selectable: false,
          evented: false,
          originX: 'left',
          originY: 'top',
        });
        canvas.add(ell);
        dragRef.current = { tool, startX: x, startY: y, obj: ell };
        canvas.requestRenderAll();
        return;
      }

      if (tool === 'line') {
        const line = new fabric.Line([x, y, x + 1, y + 1], {
          stroke,
          strokeWidth,
          selectable: false,
          evented: false,
        });
        canvas.add(line);
        dragRef.current = { tool, startX: x, startY: y, obj: line };
        canvas.requestRenderAll();
        return;
      }

      if (tool === 'text') {
        // Create a textbox; width will be updated as you drag.
        const tb = new fabric.Textbox('Text', {
          left: x,
          top: y,
          width: 40,
          fill,
          fontFamily: (fontFamily || 'Inter').trim() || 'Inter',
          fontSize,
          selectable: false,
          evented: false,
          originX: 'left',
          originY: 'top',
        });
        canvas.add(tb);
        dragRef.current = { tool, startX: x, startY: y, obj: tb };
        canvas.requestRenderAll();
        return;
      }
    };

    const onMove = (opt: any) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.tool !== tool) return;

      const { x, y } = getPointer(opt);
      const sx = d.startX;
      const sy = d.startY;
      const ox = Math.min(sx, x);
      const oy = Math.min(sy, y);
      const w = Math.max(1, Math.abs(x - sx));
      const h = Math.max(1, Math.abs(y - sy));

      if (d.tool === 'rect') {
        d.obj.set({ left: ox, top: oy, width: w, height: h });
        canvas.requestRenderAll();
        return;
      }
      if (d.tool === 'ellipse') {
        // Ellipse uses rx/ry but still respects left/top origin.
        d.obj.set({ left: ox, top: oy, rx: w / 2, ry: h / 2 });
        canvas.requestRenderAll();
        return;
      }
      if (d.tool === 'line') {
        d.obj.set({ x1: sx, y1: sy, x2: x, y2: y });
        canvas.requestRenderAll();
        return;
      }
      if (d.tool === 'text') {
        d.obj.set({ left: ox, top: oy, width: Math.max(40, w) });
        canvas.requestRenderAll();
        return;
      }
    };

    const onUp = async () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;

      try {
        d.obj.set({ selectable: true, evented: true });
      } catch {
        // ignore
      }
      canvas.selection = true;
      try {
        canvas.setActiveObject(d.obj);
      } catch {
        // ignore
      }
      canvas.requestRenderAll();

      // For text: load font (best-effort) then enter editing.
      if (d.tool === 'text') {
        try {
          await loadGoogleFonts([((fontFamily || 'Inter') as string).trim() || 'Inter']);
        } catch {
          // ignore
        }
        try {
          d.obj.enterEditing?.();
          d.obj.selectAll?.();
        } catch {
          // ignore
        }
      }

      // Auto-return to select after creating a shape/text/line.
      setTool('select');
    };

    canvas.on('mouse:down', onDown);
    canvas.on('mouse:move', onMove);
    canvas.on('mouse:up', onUp);
    return () => {
      try {
        canvas.off('mouse:down', onDown);
        canvas.off('mouse:move', onMove);
        canvas.off('mouse:up', onUp);
      } catch {
        // ignore
      }
    };
  }, [canvasApi, tool, fill, stroke, strokeWidth, fontFamily, fontSize]);

  // Keep the layers tree in sync with Fabric events (not just persisted JSON updates).
  useEffect(() => {
    const api = canvasApi || apiRef.current;
    if (!api) return;
    const canvas = api.canvas;
    let raf: number | null = null;
    const bump = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        setLayersRev((v) => v + 1);
      });
    };
    canvas.on('object:added', bump);
    canvas.on('object:removed', bump);
    canvas.on('object:modified', bump);
    canvas.on('path:created', bump);
    canvas.on('selection:created', bump);
    canvas.on('selection:updated', bump);
    canvas.on('selection:cleared', bump);
    return () => {
      try {
        if (raf) window.cancelAnimationFrame(raf);
      } catch {
        // ignore
      }
      try {
        canvas.off('object:added', bump);
        canvas.off('object:removed', bump);
        canvas.off('object:modified', bump);
        canvas.off('path:created', bump);
        canvas.off('selection:created', bump);
        canvas.off('selection:updated', bump);
        canvas.off('selection:cleared', bump);
      } catch {
        // ignore
      }
    };
  }, [canvasApi]);

  const layersTree = useMemo<LayerTreeNode[]>(() => {
    const api = apiRef.current;
    const canvas = api?.canvas;
    if (!canvas) return [];
    return buildLayerTree(canvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layersRev]);

  const layerById = useMemo(() => {
    const flat = flattenLayerTree(layersTree);
    const m = new Map<string, LayerTreeNode>();
    flat.forEach((n) => m.set(n.layerId, n));
    return m;
  }, [layersTree]);

  const renderLayerNodes = (nodes: LayerTreeNode[], depth: number): any => {
    const out: any[] = [];
    nodes.forEach((n) => {
      const hasKids = (n.children || []).length > 0;
      const open = layersTreeOpen[n.layerId] ?? true;
      const indentPx = 8 + depth * 12;
      const isHidden = !n.visible;
      const locked = n.locked;
      const isActive = activeLayerIds.includes(n.layerId);
      const isVirtual = !n.obj || n.virtual;
      const isDropTarget = dropTargetLayerId === n.layerId;
      const isBooleanSource = !!n.obj?.data?.booleanSourceId;

      out.push(
        <div key={n.layerId} className={`w-full ${isHidden ? 'opacity-60' : ''}`}>
          <div
            role="button"
            tabIndex={0}
            className={`w-full text-left px-2 py-1 hover:bg-black/5 select-none flex items-center gap-2 ${isActive ? 'bg-black/10' : ''} ${isDropTarget ? 'outline outline-1 outline-black' : ''}`}
            style={{ paddingLeft: indentPx }}
            draggable={!isVirtual && !isBooleanSource}
            onDragStart={(e) => {
              if (isVirtual) return;
              dragLayerIdRef.current = n.layerId;
              setDropTargetLayerId(null);
              try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', n.layerId);
              } catch {
                // ignore
              }
            }}
            onDragOver={(e) => {
              if (isVirtual) return;
              e.preventDefault();
              setDropTargetLayerId(n.layerId);
              try {
                e.dataTransfer.dropEffect = 'move';
              } catch {
                // ignore
              }
            }}
            onDragLeave={() => {
              setDropTargetLayerId((cur) => (cur === n.layerId ? null : cur));
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDropTargetLayerId(null);
              const api = apiRef.current;
              if (!api) return;
              const draggedId =
                (() => {
                  try {
                    return e.dataTransfer.getData('text/plain') || '';
                  } catch {
                    return '';
                  }
                })() || dragLayerIdRef.current || '';
              dragLayerIdRef.current = null;
              if (!draggedId || draggedId === n.layerId) return;
              const dragged = layerById.get(draggedId);
              if (!dragged?.obj || !n.obj) return;
              // Boolean source nodes are not reorderable directly.
              if (dragged.obj?.data?.booleanSourceId) return;

              const targetObj = n.obj;
              const draggedObj = dragged.obj;

              // Drop onto a group -> nest into it.
              if (targetObj?.type === 'group') {
                nestIntoGroup(api.canvas, api.fabric, draggedObj, targetObj);
                return;
              }

              // Otherwise: try to reorder within target's parent.
              const targetParent = targetObj.group || null;
              const draggedParent = draggedObj.group || null;

              if (targetParent && draggedParent !== targetParent) {
                nestIntoGroup(api.canvas, api.fabric, draggedObj, targetParent);
              } else if (!targetParent && draggedParent) {
                unnestFromGroup(api.canvas, api.fabric, draggedObj);
              }

              // Now reorder to target index.
              moveLayerTo(api.canvas, draggedObj, n.zIndex);
            }}
            onClick={() => {
              const api = apiRef.current;
              if (!api) return;
              if (isVirtual) {
                if (hasKids) setLayersTreeOpen((prev) => ({ ...prev, [n.layerId]: !(prev[n.layerId] ?? true) }));
                return;
              }
              // Clicking a boolean source should enter boolean edit mode automatically.
              const srcId = n.obj?.data?.booleanSourceId ? String(n.obj.data.booleanSourceId) : null;
              if (srcId) {
                setTool('select');
                setSelectMode(api.canvas);
                setActiveBooleanId(srcId);
                setIsEditingBoolean(true);
                enterBooleanEdit(api.canvas, srcId);
              }
              try {
                api.canvas.setActiveObject(n.obj);
                api.canvas.requestRenderAll();
              } catch {
                // ignore
              }
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              const api = apiRef.current;
              if (!api) return;
              if (isVirtual) {
                if (hasKids) setLayersTreeOpen((prev) => ({ ...prev, [n.layerId]: !(prev[n.layerId] ?? true) }));
                return;
              }
              const srcId = n.obj?.data?.booleanSourceId ? String(n.obj.data.booleanSourceId) : null;
              if (srcId) {
                setTool('select');
                setSelectMode(api.canvas);
                setActiveBooleanId(srcId);
                setIsEditingBoolean(true);
                enterBooleanEdit(api.canvas, srcId);
              }
              try {
                api.canvas.setActiveObject(n.obj);
                api.canvas.requestRenderAll();
              } catch {
                // ignore
              }
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const api = apiRef.current;
              if (!api) return;
              if (isVirtual) return;
              // Double click a boolean source: jump into boolean edit (already handled on click).
              const srcId = n.obj?.data?.booleanSourceId ? String(n.obj.data.booleanSourceId) : null;
              if (srcId) return;
              setRenamingLayerId(n.layerId);
              setRenameDraft(n.name);
            }}
            title={isVirtual ? 'Expand/collapse' : locked ? 'Locked' : isHidden ? 'Hidden' : 'Select'}
          >
            {hasKids ? (
              <button
                type="button"
                className="h-5 w-5 border bg-white text-[10px] leading-none flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setLayersTreeOpen((prev) => ({ ...prev, [n.layerId]: !(prev[n.layerId] ?? true) }));
                }}
                title={open ? 'Collapse group' : 'Expand group'}
              >
                {open ? '▾' : '▸'}
              </button>
            ) : (
              <div className="h-5 w-5" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">
                {renamingLayerId === n.layerId && !isVirtual ? (
                  <input
                    className="h-6 border px-1 text-xs w-full"
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setRenamingLayerId(null);
                        setRenameDraft('');
                        return;
                      }
                      if (e.key === 'Enter') {
                        const next = renameDraft.trim();
                        if (next && n.obj) renameLayer(apiRef.current?.canvas, n.obj, next);
                        setRenamingLayerId(null);
                        setRenameDraft('');
                      }
                    }}
                    onBlur={() => {
                      const next = renameDraft.trim();
                      if (next && n.obj) renameLayer(apiRef.current?.canvas, n.obj, next);
                      setRenamingLayerId(null);
                      setRenameDraft('');
                    }}
                  />
                ) : (
                  n.name
                )}
                {locked ? <span className="ml-2 text-[10px] opacity-60">(locked)</span> : null}
                {isHidden ? <span className="ml-2 text-[10px] opacity-60">(hidden)</span> : null}
                {n.boolean?.role === 'result' ? <span className="ml-2 text-[10px] opacity-60">(boolean)</span> : null}
              </div>
              <div className="text-[11px] opacity-70 truncate">{n.type}</div>
            </div>

            {/* Minimal actions (Penpot-like): visibility + lock */}
            <div className="flex items-center gap-1">
              {!isVirtual ? (
                <>
                  <button
                    type="button"
                    className="h-6 w-6 border bg-white text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      const api = apiRef.current;
                      if (!api) return;
                      toggleVisible(api.canvas, n.obj);
                    }}
                    title={n.visible ? 'Hide' : 'Show'}
                  >
                    {n.visible ? '👁' : '×'}
                  </button>
                  <button
                    type="button"
                    className="h-6 w-6 border bg-white text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      const api = apiRef.current;
                      if (!api) return;
                      setLocked(api.canvas, n.obj, !n.locked);
                    }}
                    title={n.locked ? 'Unlock' : 'Lock'}
                  >
                    {n.locked ? '🔒' : '🔓'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {hasKids && open ? <div>{renderLayerNodes((n.children || []).slice().reverse(), depth + 1)}</div> : null}
        </div>,
      );
    });
    return out;
  };

  // While editing a boolean: auto-recompute when source shapes are transformed.
  useEffect(() => {
    const api = canvasApi || apiRef.current;
    if (!api) return;
    if (!isEditingBoolean) return;
    if (!activeBooleanId) return;
    const canvas = api.canvas;

    const schedule = () => {
      if (booleanRecomputingRef.current) return;
      if (booleanRecomputeTimerRef.current) window.clearTimeout(booleanRecomputeTimerRef.current);
      booleanRecomputeTimerRef.current = window.setTimeout(() => {
        booleanRecomputeTimerRef.current = null;
        booleanRecomputingRef.current = true;
        recomputeBooleanFromSelection(api.canvas, api.fabric, activeBooleanId)
          .catch(() => {})
          .finally(() => {
            booleanRecomputingRef.current = false;
          });
      }, 220);
    };

    const onModified = (opt: any) => {
      const t = opt?.target;
      const isResult = t?.data?.boolean?.id === activeBooleanId;
      if (isResult) return;
      const isSource = t?.data?.booleanSourceId === activeBooleanId;
      if (!isSource) return;
      schedule();
    };

    canvas.on('object:modified', onModified);
    return () => {
      try {
        canvas.off('object:modified', onModified);
      } catch {
        // ignore
      }
      if (booleanRecomputeTimerRef.current) window.clearTimeout(booleanRecomputeTimerRef.current);
      booleanRecomputeTimerRef.current = null;
      booleanRecomputingRef.current = false;
    };
  }, [canvasApi, isEditingBoolean, activeBooleanId]);

  const ensureFontLoaded = async (family: string) => {
    if (!family.trim()) return;
    await loadGoogleFonts([family.trim()]);
  };

  const applyFont = async () => {
    const api = apiRef.current;
    if (!api) return;
    await ensureFontLoaded(fontFamily);
    setFontFamily(api.canvas, fontFamily.trim());
    setFontSize(api.canvas, fontSize);
  };

  const handleUploadImage = async (file: File) => {
    const api = apiRef.current;
    if (!api) return;

    // Local mode: inline data URL.
    if (!supabaseMode) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(new Error('Failed to read file'));
        fr.readAsDataURL(file);
      });
      await api.setBackgroundImageFromUrl(dataUrl, { lock: true });
      updateCellSafe({
        image: { ...(latestCellRef.current.image || {}), dataUrl, objectPath: null },
      });
      scheduleThumbWrite();
      return;
    }

    // Supabase mode: upload to Storage.
    if (!supabase || !userId) return;
    const uploaded = await uploadVisionImage({ supabase, userId, fileId, cellKey, file });
    const signedUrl = await createSignedVisionAssetUrl({ supabase, objectPath: uploaded.objectPath, expiresInSeconds: 60 * 30 });
    if (!signedUrl) return;

    await api.setBackgroundImageFromUrl(signedUrl, { lock: true });
    updateCellSafe({
      image: {
        ...(latestCellRef.current.image || {}),
        objectPath: uploaded.objectPath,
        dataUrl: null,
        width: uploaded.width,
        height: uploaded.height,
      },
    });
    scheduleThumbWrite();
  };

  return (
    <div className="fixed inset-0 z-50 bg-white text-black flex flex-col">
      <div className="h-12 px-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" className="h-8 px-2 border bg-white flex items-center gap-2" onClick={onClose} title="Back to grid">
            <ArrowLeft size={16} />
            <span className="text-sm">Grid</span>
          </button>
          <div className="font-semibold truncate">{cellKey}</div>
          <div className="text-xs opacity-70 whitespace-nowrap">{kind === 'vector' ? 'Vector Illustration' : kind === 'ui' ? 'UI Sample' : 'Image / Photography'}</div>
        </div>

        <div className="flex items-center gap-2">
          {kind !== 'image' ? (
            <div className="text-xs opacity-70 whitespace-nowrap">Editor: <span className="font-semibold">tldraw</span></div>
          ) : null}
          {kind === 'image' ? (
            <>
              <button type="button" className={`h-8 px-2 border bg-white flex items-center gap-2 ${tool === 'select' ? 'outline outline-2 outline-black' : ''}`} onClick={() => setTool('select')}>
                <Paintbrush size={16} />
                Select
              </button>
              <button type="button" className={`h-8 px-2 border bg-white flex items-center gap-2 ${tool === 'pen' ? 'outline outline-2 outline-black' : ''}`} onClick={() => setTool('pen')}>
                <PenLine size={16} />
                Pen
              </button>
              <button type="button" className={`h-8 w-8 border bg-white flex items-center justify-center ${tool === 'rect' ? 'outline outline-2 outline-black' : ''}`} onClick={() => setTool('rect')} title="Rectangle tool">
                <RectangleHorizontal size={16} />
              </button>
              <button type="button" className={`h-8 w-8 border bg-white flex items-center justify-center ${tool === 'ellipse' ? 'outline outline-2 outline-black' : ''}`} onClick={() => setTool('ellipse')} title="Ellipse tool">
                <Circle size={16} />
              </button>
              <button type="button" className={`h-8 w-8 border bg-white flex items-center justify-center ${tool === 'line' ? 'outline outline-2 outline-black' : ''}`} onClick={() => setTool('line')} title="Line tool">
                <Sparkles size={16} />
              </button>
              <button
                type="button"
                className={`h-8 w-8 border bg-white flex items-center justify-center ${tool === 'text' ? 'outline outline-2 outline-black' : ''}`}
                onClick={async () => {
                  // Pre-load font so text tool feels instant.
                  await loadGoogleFonts([(fontFamily || 'Inter').trim() || 'Inter']).catch(() => {});
                  setTool('text');
                }}
                title="Text tool"
              >
                <Type size={16} />
              </button>
              <button type="button" className="h-8 w-8 border bg-white flex items-center justify-center" onClick={() => setLayersOpen((v) => !v)} title="Layers">
                <Layers size={16} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 1) Asset (pinned) */}
        <div className="flex-1 h-full overflow-hidden">
          <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <div className="h-full p-3 overflow-hidden">
                <div ref={tldrawHostRef} className="w-full h-full overflow-hidden relative flex items-center justify-center">
                  {kind === 'image' ? (
                    <div className="h-full w-full flex overflow-hidden">
                      <div className="flex-1 overflow-hidden flex items-center justify-center">
                        <FabricCanvas
                          width={canvasSize}
                          height={canvasSize}
                          initialJson={cell.fabric}
                          onReady={(api) => {
                            apiRef.current = api;
                            setCanvasApi(api);
                            // Ensure correct initial mode.
                            if (tool === 'pen') setPenMode(api.canvas, api.fabric, { color: penColor, width: penWidth });
                            else setSelectMode(api.canvas);
                          }}
                          onChange={({ json, fonts }) => {
                            updateCellSafe({ fabric: json, fonts });
                            scheduleThumbWrite();
                          }}
                        />
                      </div>

                      {/* Keep existing image tooling inside the Asset section */}
                      <div className="w-[360px] border-l overflow-auto p-3 space-y-4">
                        <>
                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Tools</div>
                            <div className="text-[11px] opacity-70">
                              Shape/text tools work by <span className="font-semibold">dragging on the canvas</span>.
                            </div>
                          </div>

                          {kind === 'image' ? (
                            <div className="space-y-2">
                              <div className="text-sm font-semibold">Image</div>
                              <input
                                type="file"
                                accept="image/*"
                                className="block w-full text-xs"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] || null;
                                  if (!f) return;
                                  handleUploadImage(f).catch(() => {});
                                  e.currentTarget.value = '';
                                }}
                              />
                              <div className="text-[11px] opacity-70">
                                Upload sets a locked background image; annotations remain editable above it.
                              </div>
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Style</div>
                            <div className="grid grid-cols-2 gap-2 items-center">
                              <label className="text-xs opacity-80">Fill</label>
                              <input
                                type="color"
                                value={fill}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setFillColor(v);
                                  const api = apiRef.current;
                                  if (!api) return;
                                  setFill(api.canvas, v);
                                }}
                              />
                              <label className="text-xs opacity-80">Stroke</label>
                              <input
                                type="color"
                                value={stroke}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setStrokeColor(v);
                                  const api = apiRef.current;
                                  if (!api) return;
                                  setStroke(api.canvas, v, strokeWidth);
                                }}
                              />
                              <label className="text-xs opacity-80">Stroke width</label>
                              <input
                                type="number"
                                min={0}
                                max={64}
                                value={strokeWidth}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(64, Number(e.target.value || 0)));
                                  setStrokeWidthUi(v);
                                  const api = apiRef.current;
                                  if (!api) return;
                                  setStrokeWidth(api.canvas, v);
                                }}
                                className="h-8 border px-2 text-sm"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Pen</div>
                            <div className="grid grid-cols-2 gap-2 items-center">
                              <label className="text-xs opacity-80">Color</label>
                              <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} />
                              <label className="text-xs opacity-80">Width</label>
                              <input
                                type="number"
                                min={1}
                                max={32}
                                value={penWidth}
                                onChange={(e) => setPenWidth(Math.max(1, Math.min(32, Number(e.target.value || 1))))}
                                className="h-8 border px-2 text-sm"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Text</div>
                            <div className="grid gap-2">
                              <input
                                className="h-9 border px-2 text-sm"
                                value={fontFamily}
                                onChange={(e) => setFontFamilyUi(e.target.value)}
                                placeholder="Font family (Google Fonts)"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  className="h-9 border px-2 text-sm"
                                  type="number"
                                  min={6}
                                  max={200}
                                  value={fontSize}
                                  onChange={(e) => setFontSizeUi(Math.max(6, Math.min(200, Number(e.target.value || 16))))}
                                />
                                <button type="button" className="h-9 border bg-white" onClick={() => applyFont().catch(() => {})}>
                                  Apply to selection
                                </button>
                              </div>
                              <div className="text-[11px] opacity-70">Tip: select a text object first.</div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Effects</div>
                            <div className="grid gap-2">
                              <div className="grid grid-cols-2 gap-2 items-center">
                                <label className="text-xs opacity-80">Gradient</label>
                                <div className="flex items-center gap-2">
                                  <input type="color" value={grad1} onChange={(e) => setGrad1(e.target.value)} />
                                  <input type="color" value={grad2} onChange={(e) => setGrad2(e.target.value)} />
                                </div>
                              </div>
                              <button
                                type="button"
                                className="h-9 border bg-white"
                                onClick={() => {
                                  const api = apiRef.current;
                                  if (!api) return;
                                  applyLinearGradientFill(api.canvas, api.fabric, grad1, grad2);
                                }}
                              >
                                Apply gradient fill
                              </button>
                              <div className="grid grid-cols-2 gap-2 items-center">
                                <label className="text-xs opacity-80 flex items-center gap-2">Blur</label>
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.02}
                                  value={blurAmount}
                                  onChange={(e) => {
                                    const v = Number(e.target.value || 0);
                                    setBlurAmount(v);
                                    const api = apiRef.current;
                                    if (!api) return;
                                    applyBlur(api.canvas, api.fabric, v).catch(() => {});
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Arrange</div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                className="h-10 border bg-white flex items-center justify-center gap-2"
                                onClick={() => apiRef.current && bringForward(apiRef.current.canvas)}
                              >
                                <BringToFront size={16} />
                                Forward
                              </button>
                              <button
                                type="button"
                                className="h-10 border bg-white flex items-center justify-center gap-2"
                                onClick={() => apiRef.current && sendBackward(apiRef.current.canvas)}
                              >
                                <SendToBack size={16} />
                                Backward
                              </button>
                              <button
                                type="button"
                                className="h-10 border bg-white flex items-center justify-center gap-2"
                                onClick={() => apiRef.current && bringToFront(apiRef.current.canvas)}
                              >
                                <BringToFront size={16} />
                                Front
                              </button>
                              <button
                                type="button"
                                className="h-10 border bg-white flex items-center justify-center gap-2"
                                onClick={() => apiRef.current && sendToBack(apiRef.current.canvas)}
                              >
                                <SendToBack size={16} />
                                Back
                              </button>
                              <button
                                type="button"
                                className="h-10 border bg-white flex items-center justify-center gap-2"
                                onClick={() => apiRef.current && groupSelection(apiRef.current.canvas)}
                              >
                                <Group size={16} />
                                Group
                              </button>
                              <button
                                type="button"
                                className="h-10 border bg-white flex items-center justify-center gap-2"
                                onClick={() => apiRef.current && ungroup(apiRef.current.canvas)}
                              >
                                <Ungroup size={16} />
                                Ungroup
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Boolean</div>
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                className="h-9 border bg-white text-sm"
                                onClick={() => {
                                  const api = apiRef.current;
                                  if (!api) return;
                                  booleanOpSelection(api.canvas, api.fabric, 'union', { keepSources: true }).catch(() => {});
                                }}
                                title="Union (combine selected shapes)"
                              >
                                Union
                              </button>
                              <button
                                type="button"
                                className="h-9 border bg-white text-sm"
                                onClick={() => {
                                  const api = apiRef.current;
                                  if (!api) return;
                                  booleanOpSelection(api.canvas, api.fabric, 'subtract', { keepSources: true }).catch(() => {});
                                }}
                                title="Subtract. Topmost selected object becomes A; the rest are subtracted."
                              >
                                Subtract
                              </button>
                              <button
                                type="button"
                                className="h-9 border bg-white text-sm"
                                onClick={() => {
                                  const api = apiRef.current;
                                  if (!api) return;
                                  booleanOpSelection(api.canvas, api.fabric, 'intersect', { keepSources: true }).catch(() => {});
                                }}
                                title="Intersect (overlap only)"
                              >
                                Intersect
                              </button>
                            </div>
                            {activeBooleanId ? (
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    className="h-9 border bg-white text-xs"
                                    onClick={() => {
                                      const api = apiRef.current;
                                      if (!api) return;
                                      // Force select mode so move/transform works while editing boolean sources.
                                      setTool('select');
                                      setSelectMode(api.canvas);
                                      setIsEditingBoolean(true);
                                      enterBooleanEdit(api.canvas, activeBooleanId);
                                    }}
                                    disabled={isEditingBoolean}
                                    title="Reveal sources and edit shapes"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="h-9 border bg-white text-xs"
                                    onClick={() => {
                                      const api = apiRef.current;
                                      if (!api) return;
                                      recomputeBooleanFromSelection(api.canvas, api.fabric, activeBooleanId)
                                        .then(() => {})
                                        .catch(() => {});
                                    }}
                                    disabled={!isEditingBoolean}
                                    title="Recompute boolean from sources"
                                  >
                                    Recompute
                                  </button>
                                  <button
                                    type="button"
                                    className="h-9 border bg-white text-xs"
                                    onClick={() => {
                                      const api = apiRef.current;
                                      if (!api) return;
                                      setIsEditingBoolean(false);
                                      finishBooleanEdit(api.canvas, api.fabric, activeBooleanId);
                                    }}
                                    title="Hide sources and reselect result"
                                    disabled={!isEditingBoolean}
                                  >
                                    Done
                                  </button>
                                </div>
                                <div className="text-[11px] opacity-70">
                                  Select a boolean result to edit it. While editing, adjust the source shapes, then click{' '}
                                  <span className="font-semibold">Recompute</span>.
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] opacity-70">
                                Tip: select 2+ shapes, then run an op. Select the result to reveal Edit/Recompute.
                              </div>
                            )}
                          </div>

                          {layersOpen ? (
                            <div className="space-y-2">
                              <div className="text-sm font-semibold">Layers</div>
                              <div className="border divide-y">
                                {layersTree.length === 0 ? (
                                  <div className="p-2 text-xs opacity-70">No objects yet.</div>
                                ) : (
                                  <div className="py-1">{renderLayerNodes(layersTree.slice().reverse(), 0)}</div>
                                )}
                              </div>
                            </div>
                          ) : null}

                          <VisionMonitoringPanel cell={cell} canvasPx={canvasSize} />
                        </>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full">
                      <TldrawTileEditor
                        initialSnapshot={(cell.tldraw as any) || null}
                        sessionStorageKey={`vision:tldraw:session:${fileId}:${cellKey}`}
                        onChange={({ snapshot, thumbPngDataUrl }) => {
                            const safeThumb =
                              thumbPngDataUrl && thumbPngDataUrl.length <= MAX_THUMB_CHARS ? thumbPngDataUrl : undefined;
                            updateCellSafe({ tldraw: snapshot, ...(safeThumb ? { thumb: safeThumb } : null) });
                        }}
                        onMountEditor={(ed) => setTldrawEditor(ed)}
                      />
                    </div>
                  )}

                  {/* Floating layers panel (tldraw only) */}
                  {kind !== 'image' ? (
                    <TldrawOverlayPanel className="absolute left-3 top-14 z-20 w-[340px]">
                      <TldrawLayersPanel editor={tldrawEditor} />
                    </TldrawOverlayPanel>
                  ) : null}

                  {/* Small inline hint for first-time usage (image tile) */}
                  {kind === 'image' && tool === 'select' ? (
                    <div className="pointer-events-none absolute left-6 top-6 text-[11px] bg-white/90 border px-2 py-1">
                      Tip: choose <span className="font-semibold">Pen</span> to draw, or pick a shape/text tool and drag on
                      the canvas.
                    </div>
                  ) : null}
                  {kind === 'image' && (tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'text') ? (
                    <div className="pointer-events-none absolute left-6 top-6 text-[11px] bg-white/90 border px-2 py-1">
                      Drag on the canvas to create{' '}
                      {tool === 'rect'
                        ? 'a rectangle'
                        : tool === 'ellipse'
                          ? 'an ellipse'
                          : tool === 'line'
                            ? 'a line'
                            : 'a text area'}
                      .
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

