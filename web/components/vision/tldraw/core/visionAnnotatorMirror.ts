'use client';

import type { Editor } from 'tldraw';
import { createShapeId } from '@tldraw/tlschema';
import { NX_CORE_SECTION_META_KEY } from '@/components/vision/tldraw/core/visionCoreFrames';
import {
  coerceId,
  getAllShapeIdsDeep,
  getDescendantIds,
  getShape,
  safeCreateShapes,
  safeDeleteShapes,
  safeUpdateShapes,
} from '@/components/vision/tldraw/core/visionTldrawTraversal';

export const NX_MIRROR_SOURCE_META_KEY = 'nxMirrorSourceId' as const;
export const NX_MIRROR_ROOT_META_KEY = 'nxMirrorRoot' as const;

function stripCoreMeta(meta: any): any {
  const m = meta && typeof meta === 'object' ? { ...(meta as any) } : {};
  try {
    delete (m as any)[NX_CORE_SECTION_META_KEY];
  } catch {
    // ignore
  }
  // IMPORTANT: strip runtime-only FX flags so mirrored clones don't get "stuck" suppressed
  // or show proxy placeholders. tldraw merges meta patches, so write explicit booleans.
  (m as any).nxFxProxyReady = false;
  (m as any).nxFxEditMode = false;
  return m;
}

function buildChildrenMapFromDeep(editor: Editor): Map<string, string[]> {
  const ids = getAllShapeIdsDeep(editor);
  const kids = new Map<string, string[]>();
  for (const id of ids) {
    const s = getShape(editor, id);
    const pid = coerceId(s?.parentId);
    if (!pid) continue;
    const arr = kids.get(pid) || [];
    arr.push(coerceId(id));
    kids.set(pid, arr);
  }
  return kids;
}

function collectSubtreeIdsPreorder(children: Map<string, string[]>, rootId: string): string[] {
  const rid = coerceId(rootId);
  const out: string[] = [];
  const stack: string[] = [rid];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = coerceId(stack.pop());
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    const ks = (children.get(cur) || []).slice();
    for (let i = ks.length - 1; i >= 0; i--) stack.push(ks[i]);
  }
  return out;
}

export function syncAnnotatorMirror(editor: Editor, ids: { assetId: string; annotatorId: string }): void {
  const assetId = coerceId(ids.assetId);
  const annotatorId = coerceId(ids.annotatorId);
  if (!assetId || !annotatorId) {
    return;
  }

  const allIds = getAllShapeIdsDeep(editor);
  const kids = buildChildrenMapFromDeep(editor);
  const assetIds = collectSubtreeIdsPreorder(kids, assetId);

  // Find or create mirror-root group directly under annotator.
  const mirrorRoots: any[] = [];
  for (const id of allIds) {
    const s = getShape(editor, id);
    if (!s) continue;
    if (s?.meta?.[NX_MIRROR_ROOT_META_KEY] !== true) continue;
    if (coerceId(s.parentId) !== annotatorId) continue;
    mirrorRoots.push(s);
  }
  let mirrorRoot = mirrorRoots[0] || null;

  // If multiple mirror roots exist, delete extras (unlock first).
  if (mirrorRoots.length > 1) {
    for (const extraRoot of mirrorRoots.slice(1)) {
      const rid = coerceId(extraRoot?.id);
      if (!rid) continue;
      const delIds = getDescendantIds(editor, rid);
      safeUpdateShapes(
        editor,
        delIds
          .map((id) => getShape(editor, id))
          .filter(Boolean)
          .map((s: any) => ({ id: s.id, type: s.type, isLocked: false })),
      );
      safeDeleteShapes(editor, delIds);
    }
  }

  if (!mirrorRoot) {
    const id = createShapeId();
    try {
      (editor as any).createShape?.({
        id,
        type: 'group',
        parentId: annotatorId as any,
        x: 0,
        y: 0,
        isLocked: true,
        meta: { [NX_MIRROR_ROOT_META_KEY]: true, nxName: 'Mirrored Asset' },
      } as any);
    } catch {
      // ignore
    }
    mirrorRoot = getShape(editor, coerceId(id));
  }

  const mirrorRootId = coerceId(mirrorRoot?.id);
  if (!mirrorRootId) return;

  // Backfill name for older docs.
  try {
    const s: any = getShape(editor, mirrorRootId);
    const m: any = s?.meta && typeof s.meta === 'object' ? { ...(s.meta as any) } : {};
    if (!(typeof m.nxName === 'string' && m.nxName.trim())) {
      m.nxName = 'Mirrored Asset';
      safeUpdateShapes(editor, [{ id: s.id, type: s.type, meta: m } as any]);
    }
  } catch {
    // ignore
  }

  const shouldMirror = (src: any): boolean => {
    if (!src) return false;
    if (coerceId(src.id) === assetId) return false; // don't clone root frame
    if (src?.meta?.[NX_MIRROR_SOURCE_META_KEY]) return false;
    if (src?.meta?.[NX_CORE_SECTION_META_KEY]) return false;
    // Never mirror internal FX proxy shapes; they depend on in-memory raster caches and will
    // otherwise show "Rendering effects…" placeholders in the mirror.
    if (coerceId(src.type) === 'nxfx') return false;
    if (src?.meta?.nxFxProxy?.sourceId) return false;
    return true;
  };

  // Index existing mirrors anywhere by sourceId (prevents re-adding when legacy mirrors exist).
  const mirrorBySource = new Map<string, any>();
  const mirrorDuplicatesToDelete: string[] = [];
  const mirrorRecords: Array<{ id: string; type: string }> = [];
  for (const id of allIds) {
    const s = getShape(editor, id);
    if (!s) continue;
    const sid = s?.meta?.[NX_MIRROR_SOURCE_META_KEY];
    if (typeof sid !== 'string' || !sid) continue;
    mirrorRecords.push({ id: coerceId(s.id), type: coerceId(s.type) });
    const key = String(sid);
    if (!mirrorBySource.has(key)) mirrorBySource.set(key, s);
    else mirrorDuplicatesToDelete.push(coerceId(s.id));
  }

  // Unlock mirror root subtree + any mirror nodes we might touch.
  const rootSubtreeIds = getDescendantIds(editor, mirrorRootId);
  const unlockSet = new Set<string>();
  for (const id of rootSubtreeIds) unlockSet.add(coerceId(id));
  for (const r of mirrorRecords) unlockSet.add(coerceId(r.id));
  for (const id of mirrorDuplicatesToDelete) unlockSet.add(coerceId(id));
  const unlockUpdates: any[] = [];
  for (const id of Array.from(unlockSet)) {
    if (!id) continue;
    const s = getShape(editor, id);
    if (!s) continue;
    unlockUpdates.push({ id: s.id, type: s.type, isLocked: false });
  }
  safeUpdateShapes(editor, unlockUpdates);

  // Prepare creates/updates/deletes. Preserve hierarchy via preorder walk.
  const sourceSet = new Set<string>();
  for (const sid of assetIds) {
    const src = getShape(editor, sid);
    if (!shouldMirror(src)) continue;
    sourceSet.add(coerceId(src.id));
  }

  const mirrorIdBySource = new Map<string, string>();
  const toCreate: any[] = [];
  const toUpdate: any[] = [];
  const toDelete: string[] = [];

  for (const sid of assetIds) {
    const src = getShape(editor, sid);
    if (!shouldMirror(src)) continue;
    const sourceId = coerceId(src.id);
    const parentSourceId = coerceId(src.parentId);
    const parentMirrorId = sourceSet.has(parentSourceId) ? mirrorIdBySource.get(parentSourceId) || null : null;
    const nextParentId = parentMirrorId || mirrorRootId;

    const existing = mirrorBySource.get(sourceId) || null;
    const nextMeta = { ...stripCoreMeta(src.meta || {}), [NX_MIRROR_SOURCE_META_KEY]: sourceId };
    const base = {
      type: src.type,
      parentId: nextParentId,
      x: Number(src.x || 0),
      y: Number(src.y || 0),
      rotation: src.rotation,
      props: src.props,
      meta: nextMeta,
      isLocked: false,
    };

    if (!existing || coerceId(existing.type) !== coerceId(src.type)) {
      if (existing?.id) toDelete.push(coerceId(existing.id));
      const id = createShapeId();
      mirrorIdBySource.set(sourceId, coerceId(id));
      toCreate.push({ id, ...base });
    } else {
      mirrorIdBySource.set(sourceId, coerceId(existing.id));
      toUpdate.push({ id: existing.id, ...base });
    }
  }

  for (const [sourceId, s] of mirrorBySource.entries()) {
    if (!sourceSet.has(coerceId(sourceId))) toDelete.push(coerceId(s.id));
  }
  for (const id of mirrorDuplicatesToDelete) toDelete.push(coerceId(id));

  const uniqueDelete = Array.from(new Set(toDelete)).filter((id) => id && id !== mirrorRootId);
  if (uniqueDelete.length) {
    const unlockDeletes: any[] = [];
    for (const id of uniqueDelete) {
      const s = getShape(editor, id);
      if (!s) continue;
      unlockDeletes.push({ id: s.id, type: s.type, isLocked: false });
    }
    safeUpdateShapes(editor, unlockDeletes);
  }

  safeDeleteShapes(editor, uniqueDelete);
  safeCreateShapes(editor, toCreate);
  safeUpdateShapes(editor, toUpdate);

  // IMPORTANT:
  // Do NOT re-lock the entire mirrored subtree.
  // The FX proxy system (and other runtime features) needs to update mirror clones (and their proxies)
  // via `updateShapes` (e.g. meta.hidden, bounds, rev). If we lock everything here, those updates can fail
  // and the mirror will appear stale or missing effects.
  //
  // Keep only the mirror root locked as a lightweight guard.
  try {
    const root: any = getShape(editor, mirrorRootId);
    if (root) safeUpdateShapes(editor, [{ id: root.id, type: root.type, isLocked: true } as any]);
  } catch {
    // ignore
  }

  // Keep the mirror root behind overlays.
  try {
    (editor as any).sendToBack?.([mirrorRootId as any] as any);
  } catch {
    // ignore
  }
}

