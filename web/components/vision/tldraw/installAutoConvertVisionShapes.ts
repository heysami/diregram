'use client';

import type { Editor } from 'tldraw';
import { createShapeId } from '@tldraw/tlschema';
import {
  getId,
  isDragging,
  isEllipseGeo,
  isRectGeo,
  isShapeRecordId,
  makeVisionEllipseFromGeo,
  makeVisionRectFromGeo,
  makeVisionTextFromTldrawText,
  tryMakeVisionPathFromAnyTldrawShape,
  tryMakeVisionArrowFromTldrawArrow,
} from '@/components/vision/tldraw/autoconvert';

/**
 * Automatically converts newly-created default tldraw shapes into Vision-native ones.
 *
 * This intentionally ignores the initial document hydration; it only applies to shapes
 * added after the editor is mounted.
 *
 * Design goals:
 * - Keep conversion logic modular (see `autoconvert/*`)
 * - Make conversions best-effort and safe (never throw, never block the UI)
 * - Never convert a shape marked `meta.nxNoAutoConvert`
 */
export function installAutoConvertVisionShapes(editor: Editor): () => void {
  let enabled = false;
  const converted = new Set<string>();
  const pending = new Set<string>();
  const timers = new Map<string, number>();

  const enableTimer = window.setTimeout(() => {
    enabled = true;
  }, 0);

  const clearTimer = (id: string) => {
    const t = timers.get(id);
    if (t) window.clearTimeout(t);
    timers.delete(id);
  };

  const markDone = (id: string) => {
    pending.delete(id);
    clearTimer(id);
  };

  const applyConversion = (oldId: string, next: any) => {
    if (!oldId || !next) return false;
    const wasSelected = editor.getSelectedShapeIds().map(String).includes(oldId);
    const nextId = createShapeId();
    try {
      editor.createShape({ id: nextId as any, ...next } as any);
      editor.deleteShapes([oldId as any]);
      if (wasSelected) editor.setSelectedShapes([nextId as any]);
      converted.add(oldId);
      markDone(oldId);
      return true;
    } catch {
      return false;
    }
  };

  const scheduleConvert = (id: string) => {
    if (!pending.has(id)) return;
    if (converted.has(id)) {
      markDone(id);
      return;
    }
    clearTimer(id);

    const t = window.setTimeout(() => {
      try {
        const latest: any = (editor as any).getShape?.(id as any);
        if (!latest) {
          markDone(id);
          return;
        }

        // Respect opt-out.
        if (latest?.meta?.nxNoAutoConvert) {
          markDone(id);
          return;
        }

        // If still dragging, keep waiting.
        if (isDragging(editor as any)) {
          scheduleConvert(id);
          return;
        }

        const oldId = getId(latest) || id;

        if (latest.type === 'text') {
          const conv = makeVisionTextFromTldrawText(editor, latest);
          if (conv) applyConversion(oldId, conv);
        } else if (isRectGeo(latest)) {
          const conv = makeVisionRectFromGeo(editor, latest);
          if (conv) applyConversion(oldId, conv);
        } else if (isEllipseGeo(latest)) {
          const conv = makeVisionEllipseFromGeo(editor, latest);
          if (conv) applyConversion(oldId, conv);
        } else if (latest.type === 'arrow') {
          tryMakeVisionArrowFromTldrawArrow(editor, latest)
            .then((conv) => {
              if (conv) applyConversion(oldId, conv);
            })
            .catch(() => {});
        } else {
          // Any other default tldraw shape: best-effort convert to a Vision `nxpath` via SVG export.
          tryMakeVisionPathFromAnyTldrawShape(editor, latest)
            .then((conv) => {
              if (conv) applyConversion(oldId, conv);
              else markDone(oldId);
            })
            .catch(() => {
              markDone(oldId);
            });
        }

        // If conversion didn't happen (e.g. too small or still editing), keep waiting a bit.
        if (pending.has(id)) scheduleConvert(id);
      } catch {
        // ignore
      }
    }, 180);
    timers.set(id, t);
  };

  const cleanup = editor.store.listen(
    (entry: any) => {
      if (!enabled) return;
      const added = entry?.changes?.added || {};
      const updated = entry?.changes?.updated || {};

      for (const [rid, rec] of Object.entries<any>(added)) {
        if (!isShapeRecordId(String(rid))) continue;
        if (!rec) continue;
        const id = getId(rec) || String(rid);
        if (!id) continue;
        if (converted.has(id)) continue;
        if (rec.meta?.nxNoAutoConvert) continue;

        // Convert default *vector* tldraw shapes into Vision-native ones.
        // Avoid converting non-vector/asset types (image/embed/etc.) which we don't want to "path-ify".
        const t = String(rec.type || '');
        const should =
          t === 'text' ||
          t === 'geo' ||
          t === 'arrow' ||
          t === 'draw' ||
          t === 'line' ||
          t === 'highlight' ||
          t === 'note';
        if (!should) continue;
        pending.add(id);
        scheduleConvert(id);
      }

      for (const [rid, pair] of Object.entries<any>(updated)) {
        if (!isShapeRecordId(String(rid))) continue;
        const to = Array.isArray(pair) ? pair[1] : null;
        if (!to) continue;
        const id = getId(to) || String(rid);
        if (!pending.has(id)) continue;
        scheduleConvert(id);
      }
    },
    { scope: 'document' as any },
  );

  return () => {
    window.clearTimeout(enableTimer);
    try {
      cleanup?.();
    } catch {
      // ignore
    }
    converted.clear();
    pending.clear();
    for (const id of timers.keys()) clearTimer(id);
    timers.clear();
  };
}

