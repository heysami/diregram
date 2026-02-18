'use client';

import type { Editor } from 'tldraw';
import { editableToSvgPath, stringifyEditable, tryParseEditable, type NxBezierNode } from '@/components/vision/tldraw/vector-pen/editablePath';
import { getSelectedNodeId, isVectorPenActive, setSelectedNodeId, setVectorPenMeta } from '@/components/vision/tldraw/vector-pen/meta';

function isTextInput(el: EventTarget | null) {
  const e = el as HTMLElement | null;
  if (!e) return false;
  const tag = String((e as any).tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((e as any).isContentEditable) return true;
  return false;
}

function minNodesFor(data: any): number {
  if (!data) return 2;
  // Closed paths need 3 nodes; open paths need 2.
  const closed = !!data.closed;
  return closed ? 3 : 2;
}

function deleteAnchor(shape: any, anchorNodeId: string): { nxEdit: string; d: string } | null {
  const data = tryParseEditable(shape?.props?.nxEdit);
  if (!data) return null;
  const nodes = Array.isArray((data as any).nodes) ? ((data as any).nodes as NxBezierNode[]).slice() : [];
  const idx = nodes.findIndex((n) => String(n?.id || '') === String(anchorNodeId));
  if (idx < 0) return null;

  const min = minNodesFor(data as any);
  if (nodes.length <= min) return null;

  nodes.splice(idx, 1);
  // If you delete nodes from a parametric rect/ellipse, it stops being that shape and becomes a generic path.
  const next: any =
    (data as any).kind === 'rect' || (data as any).kind === 'ellipse'
      ? { v: 1, kind: 'path', closed: true, nodes }
      : { ...(data as any), nodes };
  const d = editableToSvgPath(next) || String(shape?.props?.d || '');
  return { nxEdit: stringifyEditable(next), d };
}

function getPointingHandleId(editor: any): string | null {
  try {
    if (editor?.isIn?.('select.pointing_handle')) {
      const node = editor.getStateDescendant?.('select.pointing_handle');
      const hid = node?.info?.handle?.id;
      return typeof hid === 'string' ? hid : null;
    }
  } catch {
    // ignore
  }
  try {
    if (editor?.isIn?.('select.dragging_handle')) {
      const node = editor.getStateDescendant?.('select.dragging_handle');
      const hid = node?.info?.handle?.id;
      return typeof hid === 'string' ? hid : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function nearestAnchorId(data: any, x: number, y: number, maxDist: number): string | null {
  const nodes = Array.isArray(data?.nodes) ? (data.nodes as NxBezierNode[]) : [];
  let best: { id: string; d2: number } | null = null;
  const lim2 = maxDist * maxDist;
  for (const n of nodes) {
    const d2 = dist2(Number(n.x || 0), Number(n.y || 0), x, y);
    if (d2 > lim2) continue;
    if (!best || d2 < best.d2) best = { id: String(n.id), d2 };
  }
  return best ? best.id : null;
}

function pointToSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return dist2(px, py, cx, cy);
}

function insertNodeAtPoint(shape: any, localX: number, localY: number): { nxEdit: string; d: string; newNodeId: string } | null {
  const data = tryParseEditable(shape?.props?.nxEdit);
  if (!data) return null;
  const nodes = Array.isArray((data as any).nodes) ? ((data as any).nodes as NxBezierNode[]).slice() : [];
  if (nodes.length < 2) return null;
  const closed = !!(data as any).closed;

  // Find closest segment between anchors (line approximation).
  const last = closed ? nodes.length : nodes.length - 1;
  let bestIdx = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < last; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    const d2 = pointToSegDist2(localX, localY, Number(a.x || 0), Number(a.y || 0), Number(b.x || 0), Number(b.y || 0));
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = i;
    }
  }

  const newNodeId = `n_${Math.random().toString(36).slice(2, 10)}`;
  const nn: NxBezierNode = { id: newNodeId, x: localX, y: localY, inX: localX, inY: localY, outX: localX, outY: localY };
  nodes.splice(bestIdx + 1, 0, nn);
  // Inserting nodes turns parametric rect/ellipse into a generic path.
  const next: any =
    (data as any).kind === 'rect' || (data as any).kind === 'ellipse'
      ? { v: 1, kind: 'path', closed: !!(data as any).closed, nodes }
      : { ...(data as any), nodes };
  const d = editableToSvgPath(next) || String(shape?.props?.d || '');
  return { nxEdit: stringifyEditable(next), d, newNodeId };
}

export function installVectorPenInteractions(editor: Editor): () => void {
  const onPointerDown = (e: PointerEvent) => {
    if (isTextInput(e.target)) return;
    // Ignore clicks on tldraw UI chrome (toolbar, style panel, etc.)
    try {
      const t = e.target as any;
      if (t && typeof t.closest === 'function' && t.closest('.tlui')) return;
    } catch {
      // ignore
    }
    const only: any = editor.getOnlySelectedShape?.();
    const penActive = isVectorPenActive(editor);

    if (!only || String(only.type || '') !== 'nxpath') {
      if (!penActive) setSelectedNodeId(editor, null);
      return;
    }

    const data = tryParseEditable(only?.props?.nxEdit);
    if (!data) return;

    // Convert screen point -> page -> local
    let page: any = null;
    try {
      page = (editor as any).screenToPage?.({ x: (e as any).clientX, y: (e as any).clientY });
    } catch {
      page = null;
    }
    if (!page) return;
    let local: any = null;
    try {
      local = (editor as any).getPointInShapeSpace?.(only, page);
    } catch {
      local = null;
    }
    if (!local) return;
    const lx = Number(local.x);
    const ly = Number(local.y);
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return;

    // Prefer selecting an anchor if click is near one.
    const anchorId = nearestAnchorId(data, lx, ly, 10);
    if (anchorId) {
      setSelectedNodeId(editor, anchorId);
      return;
    }

    // In Vector Pen mode, clicking on the path inserts a node.
    if (penActive) {
      const ins = insertNodeAtPoint(only, lx, ly);
      if (!ins) return;
      try {
        editor.updateShapes([{ id: only.id, type: only.type, props: { nxEdit: ins.nxEdit, d: ins.d } } as any]);
        setSelectedNodeId(editor, ins.newNodeId);
      } catch {
        // ignore
      }
    } else {
      setSelectedNodeId(editor, null);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (isTextInput(e.target)) return;

    const only: any = editor.getOnlySelectedShape?.();
    if (!only || String(only.type || '') !== 'nxpath') return;
    const data = tryParseEditable(only?.props?.nxEdit);
    if (!data) return;

    const hid = getPointingHandleId(editor as any);
    const anchorNodeId = hid && hid.startsWith('a:') ? hid.slice(2) : getSelectedNodeId(editor);
    if (!anchorNodeId) return;

    // If user is trying to delete a node, never let the key event bubble into tldraw's
    // default "delete selected shape" behavior.
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {
      // ignore
    }

    const patch = deleteAnchor(only, anchorNodeId);
    if (!patch) return;

    try {
      editor.updateShapes([{ id: only.id, type: only.type, props: patch } as any]);
      setVectorPenMeta(editor, { nxSelectedNodeId: null });
    } catch {
      // ignore
    }
  };

  // If the user switches to any other tool, disable vector pen mode.
  // This prevents “sticky” vector-pen state and fixes the extra-click UX.
  let toolSyncing = false;
  let lastToolId = '';
  const unlistenTool = (editor as any)?.store?.listen?.(
    () => {
      if (toolSyncing) return;
      let tid = '';
      try {
        tid = String((editor as any)?.getCurrentToolId?.() || '');
      } catch {
        tid = '';
      }
      if (!tid || tid === lastToolId) return;
      lastToolId = tid;
      // Only auto-disable when switching away from select (vector pen itself returns to select).
      if (tid === 'select') return;
      if (!isVectorPenActive(editor)) return;
      toolSyncing = true;
      try {
        setVectorPenMeta(editor, { nxVectorPen: false, nxSelectedNodeId: null } as any);
      } finally {
        toolSyncing = false;
      }
    },
    { scope: 'session' as any },
  );

  window.addEventListener('pointerdown', onPointerDown, { capture: true });
  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => {
    window.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
    window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
    try {
      unlistenTool?.();
    } catch {
      // ignore
    }
  };
}

// Back-compat export (older name used by callers).
export const installEditablePathPointEditing = installVectorPenInteractions;

