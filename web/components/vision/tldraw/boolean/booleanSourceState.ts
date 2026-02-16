'use client';

import type { Editor, TLShapeId } from 'tldraw';
import { setHiddenForSubtree } from '@/components/vision/tldraw/fx/proxy/proxyVisibility';

/**
 * Boolean bundle invariants:
 * - Sources must not visually render while the boolean is active (even if `meta.hidden` flips).
 * - Sources may be kept in the document for recompute / unbundle.
 *
 * We enforce this by tagging sources with `meta.nxBooleanSource === true` and by hiding their subtree.
 */

export const NX_BOOLEAN_SOURCE_META_KEY = 'nxBooleanSource';

export function isBooleanSourceMeta(meta: any): boolean {
  return meta?.[NX_BOOLEAN_SOURCE_META_KEY] === true;
}

export function setBooleanSourceFlagForSubtree(editor: Editor, rootId: TLShapeId, enabled: boolean): void {
  let ids: string[] = [];
  try {
    ids = ((editor as any).getShapeAndDescendantIds?.(rootId as any) || []).map(String);
  } catch {
    ids = [String(rootId)];
  }
  const updates: any[] = [];
  for (const id of ids) {
    const s: any = editor.getShape(id as any);
    if (!s) continue;
    const meta: any = { ...(s.meta || {}) };
    // IMPORTANT: tldraw merges meta patches; use explicit boolean so we can reliably toggle/clear.
    meta[NX_BOOLEAN_SOURCE_META_KEY] = enabled ? true : false;
    updates.push({ id: s.id, type: s.type, meta });
  }
  if (updates.length) {
    try {
      editor.updateShapes(updates as any);
    } catch {
      // ignore
    }
  }
}

/**
 * Hide/unhide boolean sources, keeping the tag in sync.
 *
 * - When `hidden === true`: we hide subtree and set `nxBooleanSource: true`.
 * - When `hidden === false`: we unhide subtree and set `nxBooleanSource: false`.
 */
export function setBooleanSourcesHidden(editor: Editor, rootIds: TLShapeId[], hidden: boolean): void {
  for (const rid of rootIds) {
    if (!rid) continue;
    try {
      setHiddenForSubtree(editor, rid as any, hidden);
    } catch {
      // ignore
    }
    try {
      setBooleanSourceFlagForSubtree(editor, rid as any, hidden);
    } catch {
      // ignore
    }
  }
}

