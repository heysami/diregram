'use client';

import { useEffect } from 'react';
import type { Editor } from 'tldraw';
import { recomputeBooleanResult } from '@/components/vision/tldraw/boolean/bundles';

export function installAutoRecomputeBooleans(editor: Editor): () => void {
  const depsBySource = new Map<string, Set<string>>();
  const sourcesByBoolean = new Map<string, string[]>();
  const pendingRecompute = new Set<string>();
  let recomputeTimer: number | null = null;

  const clearBoolean = (booleanId: string) => {
    const prevSources = sourcesByBoolean.get(booleanId) || [];
    for (const sid of prevSources) {
      const set = depsBySource.get(sid);
      if (!set) continue;
      set.delete(booleanId);
      if (set.size === 0) depsBySource.delete(sid);
    }
    sourcesByBoolean.delete(booleanId);
  };

  const indexBoolean = (rec: any) => {
    const booleanId = String(rec?.id || '');
    const nx = rec?.meta?.nxBoolean;
    const opOk = nx?.op === 'union' || nx?.op === 'subtract' || nx?.op === 'intersect';
    const sources = Array.isArray(nx?.sources) ? nx.sources.map(String).filter(Boolean) : [];
    if (!booleanId.startsWith('shape:')) return;
    // Only index non-destructive boolean results.
    if (rec?.type !== 'nxpath' || !opOk || sources.length < 2) {
      clearBoolean(booleanId);
      return;
    }
    clearBoolean(booleanId);
    sourcesByBoolean.set(booleanId, sources);
    for (const sid of sources) {
      const set = depsBySource.get(sid) || new Set<string>();
      set.add(booleanId);
      depsBySource.set(sid, set);
    }
  };

  const buildInitialIndex = () => {
    depsBySource.clear();
    sourcesByBoolean.clear();
    try {
      const ids = Array.from(editor.getCurrentPageShapeIds?.() || []);
      for (const id of ids) {
        const s: any = editor.getShape(id as any);
        if (!s) continue;
        indexBoolean(s);
      }
    } catch {
      // ignore
    }
  };

  const schedule = () => {
    if (recomputeTimer) window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(async () => {
      recomputeTimer = null;
      const ids = Array.from(pendingRecompute);
      pendingRecompute.clear();
      for (const id of ids) {
        try {
          await recomputeBooleanResult(editor, id as any);
        } catch {
          // ignore
        }
      }
    }, 220);
  };

  buildInitialIndex();

  const isMeaningfulShapeChange = (from: any, to: any) => {
    if (!from || !to) return true;
    // Ignore purely visual/UX changes that shouldn't affect boolean geometry.
    const xy = from.x !== to.x || from.y !== to.y;
    const rot = from.rotation !== to.rotation;
    const parent = from.parentId !== to.parentId;
    const idx = from.index !== to.index;
    // Props changes likely affect geometry for geo/nxpath/text.
    const props = JSON.stringify(from.props || {}) !== JSON.stringify(to.props || {});
    const nxBool = JSON.stringify(from?.meta?.nxBoolean || null) !== JSON.stringify(to?.meta?.nxBoolean || null);
    return Boolean(xy || rot || parent || idx || props || nxBool);
  };

  const cleanup = editor.store.listen(
    (entry: any) => {
      const changedShapeIds = new Set<string>();
      const added = entry?.changes?.added || {};
      const updated = entry?.changes?.updated || {};
      const removed = entry?.changes?.removed || {};

      for (const [rid, rec] of Object.entries<any>(added)) {
        if (String(rid).startsWith('shape:')) {
          changedShapeIds.add(String(rid));
          indexBoolean(rec);
        }
      }

      for (const [rid, pair] of Object.entries<any>(updated)) {
        if (!String(rid).startsWith('shape:')) continue;
        const from = Array.isArray(pair) ? pair[0] : null;
        const to = Array.isArray(pair) ? pair[1] : null;
        if (from) indexBoolean(from);
        if (to) indexBoolean(to);
        if (isMeaningfulShapeChange(from, to)) changedShapeIds.add(String(rid));
      }

      for (const [rid, rec] of Object.entries<any>(removed)) {
        if (!String(rid).startsWith('shape:')) continue;
        changedShapeIds.add(String(rid));
        if (rec) clearBoolean(String((rec as any).id || rid));
        else clearBoolean(String(rid));
      }

      // If any boolean source changed, recompute the booleans that depend on it.
      for (const sid of changedShapeIds) {
        const booleans = depsBySource.get(sid);
        if (!booleans) continue;
        for (const bid of booleans) pendingRecompute.add(bid);
      }
      if (pendingRecompute.size) schedule();
    },
    { scope: 'document' as any },
  );

  return () => {
    try {
      cleanup?.();
    } catch {
      // ignore
    }
    if (recomputeTimer) window.clearTimeout(recomputeTimer);
    recomputeTimer = null;
    pendingRecompute.clear();
  };
}

export function useAutoRecomputeBooleans(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return;
    return installAutoRecomputeBooleans(editor);
  }, [editor]);
}

