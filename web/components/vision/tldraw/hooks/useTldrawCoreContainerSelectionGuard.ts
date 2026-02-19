'use client';

import { useEffect, useRef } from 'react';
import type { Editor, TLShape, TLShapeId } from 'tldraw';
import { findCoreFrameId, NX_CORE_SECTION_META_KEY } from '@/components/vision/tldraw/core/visionCoreContainers';

function shapeMeta(shape: TLShape | null | undefined): Record<string, unknown> {
  return ((shape?.meta as unknown) || {}) as Record<string, unknown>;
}

export function useTldrawCoreContainerSelectionGuard(editor: Editor | null) {
  const lastBrushAtRef = useRef<number>(0);
  const prevIsBrushingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!editor) return;

    const selectionCleanup = (() => {
      let lastKey = '';
      return () => {
        try {
          const ids = Array.from(editor.getSelectedShapeIds?.() || []) as TLShapeId[];
          const key = ids.join(',');
          if (key === lastKey) return;
          lastKey = key;
          const isBrushing = (() => {
            try {
              const f = (editor as unknown as { isInAny?: (...args: string[]) => boolean }).isInAny;
              return typeof f === 'function' ? !!f('select.brushing', 'select.pointing') : false;
            } catch {
              return false;
            }
          })();
          if (isBrushing) lastBrushAtRef.current = Date.now();
          const prevBrushing = prevIsBrushingRef.current;
          prevIsBrushingRef.current = isBrushing;
          const justEndedBrush = prevBrushing && !isBrushing;
          const justBrushed = Date.now() - (lastBrushAtRef.current || 0) < 800;

          const coreIds = new Set<string>();
          try {
            const t = findCoreFrameId(editor, 'thumb');
            const a = findCoreFrameId(editor, 'asset');
            const n = findCoreFrameId(editor, 'annotator');
            if (t) coreIds.add(String(t));
            if (a) coreIds.add(String(a));
            if (n) coreIds.add(String(n));
          } catch {
            // ignore
          }

          const filtered = ids.filter((id) => {
            const s = editor.getShape(id);
            const meta = shapeMeta(s);
            const role = meta[NX_CORE_SECTION_META_KEY];
            const bgFor = String(meta.nxCoreBgFor || '');
            if (bgFor === 'asset' || bgFor === 'thumb' || bgFor === 'annotator') return false;
            if (role === 'asset' || role === 'thumb' || role === 'annotator') return false;
            if (coreIds.size && coreIds.has(String(id))) return false;
            return true;
          });

          // Only intervene when it's a multi-selection OR when brushing selects a core container as the only selection.
          const removedCore = filtered.length !== ids.length;
          const shouldIntervene =
            (ids.length > 1 && removedCore) ||
            (removedCore && (isBrushing || justBrushed || justEndedBrush));
          if (!shouldIntervene) return;
          if (filtered.length === ids.length) return;

          const applySelection = (nextIds: string[]) => {
            try {
              editor.setSelectedShapes(nextIds as unknown as TLShapeId[]);
            } catch {
              // ignore
            }
            // Allow re-filtering if tldraw re-applies the same pre-filter selection key later.
            lastKey = nextIds.join(',');
          };

          // If we filtered out core containers and ended up empty, attempt a fallback selection:
          // select descendants of the core container (thumb/asset) so marquee still selects the user's content.
          if (filtered.length === 0 && removedCore && (isBrushing || justBrushed || justEndedBrush)) {
            const coreRoots = ids
              .map((id) => {
                const s = editor.getShape(id);
                const meta = shapeMeta(s);
                const role = String(meta[NX_CORE_SECTION_META_KEY] || '');
                return { id: String(id), role };
              })
              .filter((x) => x.role === 'thumb' || x.role === 'asset');
            const rootId = coreRoots.length === 1 ? coreRoots[0]!.id : null;
            const collectDescendants = (pid: TLShapeId): TLShapeId[] => {
              const out: TLShapeId[] = [];
              const stack: TLShapeId[] = [pid];
              const seen = new Set<TLShapeId>();
              while (stack.length) {
                const cur = stack.pop();
                if (!cur || seen.has(cur)) continue;
                seen.add(cur);
                try {
                  const kids = editor.getSortedChildIdsForParent(cur);
                  for (const kid of kids) {
                    if (!kid || seen.has(kid)) continue;
                    out.push(kid);
                    stack.push(kid);
                  }
                } catch {
                  // ignore
                }
              }
              return out;
            };
            const desc = rootId ? collectDescendants(rootId as TLShapeId) : [];
            const fallback = desc.filter((id) => {
              const s = editor.getShape(id);
              if (!s) return false;
              const meta = shapeMeta(s);
              const role = meta[NX_CORE_SECTION_META_KEY];
              const bgFor = String(meta.nxCoreBgFor || '');
              if (bgFor === 'asset' || bgFor === 'thumb' || bgFor === 'annotator') return false;
              if (role === 'asset' || role === 'thumb' || role === 'annotator') return false;
              if (coreIds.size && coreIds.has(String(id))) return false;
              return true;
            });
            applySelection(fallback);
          } else {
            applySelection(filtered.map(String));
          }
        } catch {
          // ignore
        }
      };
    })();

    const cleanupSelection = (editor as unknown as { store: { listen: (fn: () => void, opts: unknown) => () => void } }).store.listen(
      selectionCleanup,
      { scope: 'all' },
    );
    return () => {
      try {
        cleanupSelection?.();
      } catch {
        // ignore
      }
    };
  }, [editor]);
}

