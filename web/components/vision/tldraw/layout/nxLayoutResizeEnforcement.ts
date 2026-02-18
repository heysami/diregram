'use client';

import type { Editor } from 'tldraw';
import { applyAutoLayout, applyManualConstraints, type NxLayoutSizeOverride } from './nxLayoutEngine';
import { readNxLayoutChildMeta } from './nxLayoutMeta';
import { tryReadLinePoints } from './nxLayoutLinePoints';
import { isNxLayout } from './nxLayoutUtils';

type ManualResizeSession = {
  containerId: string;
  fromContainer: any;
  toContainerLatest: any | null;
  childBaselineById: Map<string, any>;
};

let manualWasResizing = false;
let manualSession: ManualResizeSession | null = null;
let manualApplying = false;

function cloneShapeSnapshot(s: any): any {
  if (!s || typeof s !== 'object') return s;
  const props = s.props && typeof s.props === 'object' ? { ...s.props } : s.props;
  const meta = s.meta && typeof s.meta === 'object' ? { ...s.meta } : s.meta;
  return { id: s.id, type: s.type, parentId: s.parentId, x: s.x, y: s.y, props, meta, isLocked: s.isLocked };
}

export function finalizeManualConstraintsAfterResize(opts: { editor: Editor; setMutating: (next: boolean) => void }): boolean {
  const { editor, setMutating } = opts;
  if (!manualWasResizing || !manualSession) return false;
  if (manualApplying) return false;

  let resizing = false;
  try {
    resizing = Boolean((editor as any).isInAny?.('select.resizing'));
  } catch {
    resizing = false;
  }
  if (resizing) return false;

  const session = manualSession;
  const onlyId = session.containerId;
  let containerNow: any = null;
  try {
    containerNow = (editor as any).getShape?.(onlyId as any);
  } catch {
    containerNow = null;
  }

  const toContainer = containerNow ? cloneShapeSnapshot(containerNow) : session.toContainerLatest;
  if (!toContainer || !isNxLayout(toContainer) || String((toContainer as any)?.props?.layoutMode || 'manual') !== 'manual') {
    manualWasResizing = false;
    manualSession = null;
    return false;
  }

  const updates = applyManualConstraints(editor, session.fromContainer, toContainer, session.childBaselineById);

  if (updates.length) {
    setMutating(true);
    manualApplying = true;
    try {
      editor.updateShapes(updates as any);
    } catch {
      // ignore
    } finally {
      manualApplying = false;
      window.requestAnimationFrame(() => setMutating(false));
    }
  }

  manualWasResizing = false;
  manualSession = null;
  return Boolean(updates.length);
}

/**
 * During interactive resize, tldraw may apply a parent->descendants scale transform.
 * For auto `nxlayout`, we instead enforce padding/gap/fill every tick.
 *
 * Returns true if it applied updates (and set mutating true).
 */
export function enforceAutoLayoutDuringResize(opts: {
  editor: Editor;
  entry: any;
  mutating: boolean;
  setMutating: (next: boolean) => void;
}): boolean {
  const { editor, entry, mutating, setMutating } = opts;
  if (mutating) return false;

  let resizing = false;
  let only: any = null;
  try {
    resizing = Boolean((editor as any).isInAny?.('select.resizing'));
    only = (editor as any).getOnlySelectedShape?.();
  } catch {
    resizing = false;
    only = null;
  }
  if (!resizing || !only || !isNxLayout(only)) return false;
  if (String(only?.props?.layoutMode || 'manual') !== 'auto') return false;

  const onlyId = String(only.id || '');
  const updated = entry?.changes?.updated || {};

  const overrides = new Map<string, NxLayoutSizeOverride>();
  const restoreSize: any[] = [];

  let touchedKids = 0;
  for (const pair of Object.values<any>(updated)) {
    const from = Array.isArray(pair) ? pair[0] : null;
    const to = Array.isArray(pair) ? pair[1] : null;
    if (!from || !to) continue;

    const pid = String((to as any).parentId || '');
    if (!pid || !pid.includes(onlyId)) continue;
    touchedKids++;

    const childId = String((to as any).id || '');
    const childMeta = readNxLayoutChildMeta((to as any).meta);
    const fp: any = (from as any).props || {};

    const ov: NxLayoutSizeOverride = {};
    if (fp.w !== undefined) ov.w = fp.w;
    if (fp.h !== undefined) ov.h = fp.h;
    const lr = tryReadLinePoints(from);
    if (lr) ov.linePoints = lr.points.map((pp) => pp.p);
    if (ov.w !== undefined || ov.h !== undefined || (ov.linePoints && ov.linePoints.length)) overrides.set(childId, ov);

    // Restore fixed/hug child sizes so they don't inherit the parent's scale.
    const rs: any = { id: (to as any).id, type: (to as any).type };
    let any = false;
    if (fp.w !== undefined && childMeta.sizeX !== 'fill') {
      rs.props = { ...((to as any).props || {}) };
      rs.props.w = fp.w;
      any = true;
    }
    if (fp.h !== undefined && childMeta.sizeY !== 'fill') {
      rs.props = rs.props ? rs.props : { ...((to as any).props || {}) };
      rs.props.h = fp.h;
      any = true;
    }
    if (lr && childMeta.sizeX !== 'fill' && childMeta.sizeY !== 'fill') {
      rs.props = rs.props ? rs.props : { ...((to as any).props || {}) };
      if (fp.points !== undefined) rs.props.points = fp.points;
      if (fp.handles !== undefined) rs.props.handles = fp.handles;
      if (fp.start !== undefined) rs.props.start = fp.start;
      if (fp.end !== undefined) rs.props.end = fp.end;
      any = true;
    }
    if (any) restoreSize.push(rs);
  }

  const { shapeUpdates, containerPatch } = applyAutoLayout(editor, only, overrides);
  const containerUpdates: any[] = [];
  if (containerPatch && Object.keys(containerPatch).length) {
    containerUpdates.push({ id: only.id, type: only.type, props: { ...(only.props || {}), ...containerPatch } });
  }

  if (!shapeUpdates.length && !containerUpdates.length && !restoreSize.length) return false;

  setMutating(true);
  try {
    if (shapeUpdates.length) editor.updateShapes(shapeUpdates as any);
    if (containerUpdates.length) editor.updateShapes(containerUpdates as any);
    if (restoreSize.length) editor.updateShapes(restoreSize as any);
  } catch {
    // ignore
  } finally {
    // Let store events settle.
    window.setTimeout(() => {
      setMutating(false);
    }, 0);
  }

  // `touchedKids` is currently only for potential future debugging.
  void touchedKids;
  return true;
}

/**
 * Manual constraints should win over the editor's default parent->descendants scaling during interactive resize.
 *
 * Returns true if it applied updates (and set mutating true).
 */
export function enforceManualConstraintsDuringResize(opts: {
  editor: Editor;
  entry: any;
  mutating: boolean;
  setMutating: (next: boolean) => void;
}): boolean {
  const { editor, entry, mutating, setMutating } = opts;
  // NOTE: We intentionally do NOT bail on `mutating` here.
  // tldraw may apply additional "scale descendants" updates after we write, while `mutating` is still true.
  // We must be able to respond to those updates and re-assert constraints.
  if (manualApplying) return false;

  let resizing = false;
  let only: any = null;
  try {
    resizing = Boolean((editor as any).isInAny?.('select.resizing'));
    only = (editor as any).getOnlySelectedShape?.();
  } catch {
    resizing = false;
    only = null;
  }
  if (!resizing || !only || !isNxLayout(only)) {
    // If we just ended a resize, finalize once (no fighting during drag).
    //
    // IMPORTANT: Do not clear the session here. Depending on event ordering, we can
    // observe `!resizing` / missing selection before tldraw has fully finished applying
    // its final resize transform. In that case `finalize...` may bail and we must keep
    // the session around for a later tick / scheduled finalize to succeed.
    try {
      finalizeManualConstraintsAfterResize({ editor, setMutating });
    } catch {
      // ignore
    }
    return false;
  }
  if (String(only?.props?.layoutMode || 'manual') !== 'manual') return false;

  const onlyId = String(only.id || '');
  const updated = entry?.changes?.updated || {};

  // Track container from/to in this store tick (if present).
  let tickContainerFrom: any = null;
  let tickContainerTo: any = null;
  for (const pair of Object.values<any>(updated)) {
    const from = Array.isArray(pair) ? pair[0] : null;
    const to = Array.isArray(pair) ? pair[1] : null;
    if (!from || !to) continue;
    const tid = String((to as any).id || '');
    if (tid === onlyId && isNxLayout(to)) {
      tickContainerFrom = cloneShapeSnapshot(from);
      tickContainerTo = cloneShapeSnapshot(to);
      break;
    }
  }

  // Capture a stable baseline at the start of the resize session.
  if (!manualWasResizing || !manualSession || manualSession.containerId !== onlyId) {
    manualWasResizing = true;
    const childBaselineById = new Map<string, any>();
    try {
      // Prefer the `from` records in this tick (pre-scale) as baseline if available.
      for (const pair of Object.values<any>(updated)) {
        const from = Array.isArray(pair) ? pair[0] : null;
        const to = Array.isArray(pair) ? pair[1] : null;
        if (!from || !to) continue;
        const pid = String((to as any).parentId || '');
        if (!pid || !pid.includes(onlyId)) continue;
        childBaselineById.set(String((to as any).id || ''), cloneShapeSnapshot(from));
      }
      if (!childBaselineById.size) {
        const childIds: any[] = ((editor as any).getSortedChildIdsForParent?.(only.id as any) || []).filter(Boolean);
        for (const cid of childIds) {
          try {
            const s: any = (editor as any).getShape?.(cid as any);
            if (!s) continue;
            childBaselineById.set(String(s.id), cloneShapeSnapshot(s));
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
    manualSession = {
      containerId: onlyId,
      fromContainer: tickContainerFrom || cloneShapeSnapshot(only),
      toContainerLatest: tickContainerTo || cloneShapeSnapshot(only),
      childBaselineById,
    };
  }

  // While dragging: do NOT apply updates. We let tldraw do its default scaling,
  // then we correct once at resize end (pointerup / end of select.resizing).
  if (manualSession && manualSession.containerId === onlyId) {
    manualSession.toContainerLatest = tickContainerTo || cloneShapeSnapshot(only);
  }
  void mutating;
  return false;
}

/**
 * Stronger manual-mode override: run after pointermove (bubble) so we're last-writer
 * after tldraw's internal resize/scale logic.
 */
export function tickManualConstraintsWhileResizing(opts: { editor: Editor; setMutating: (next: boolean) => void }): void {
  const { editor, setMutating } = opts;
  // During drag: run as a "last writer" after tldraw's internal resize / scale-descendants
  // logic to keep manual constraints in effect (anchored children should not stretch).
  if (manualApplying) return;
  try {
    const resizing = Boolean((editor as any).isInAny?.('select.resizing'));
    const only: any = (editor as any).getOnlySelectedShape?.();
    if (!resizing || !only || !isNxLayout(only) || String(only?.props?.layoutMode || 'manual') !== 'manual') return;
    const onlyId = String(only.id || '');
    const toSnap = cloneShapeSnapshot(only);

    // Only run when we have a stable baseline session captured by the store listener.
    // (That listener prefers the "from" records in the resize tick, which avoids using
    // already-scaled geometry as the baseline.)
    const session = manualSession;
    if (!session || session.containerId !== onlyId) return;
    session.toContainerLatest = toSnap;

    const updates = applyManualConstraints(editor, session.fromContainer, toSnap, session.childBaselineById);
    if (!updates.length) return;

    setMutating(true);
    manualApplying = true;
    try {
      editor.updateShapes(updates as any);
    } catch {
      // ignore
    } finally {
      manualApplying = false;
      window.requestAnimationFrame(() => setMutating(false));
    }
  } catch {
    // ignore
  }
}

