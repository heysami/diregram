import { useCallback, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import type { AppView } from '@/components/AppHeader';
import { buildDefaultFlowTabSwimlane, loadFlowTabSwimlane, saveFlowTabSwimlane } from '@/lib/flowtab-swimlane-storage';
import { savePinnedTags } from '@/lib/pinned-tags';
import { isStringArrayEqual } from '@/lib/array-utils';

type FlowPinnedContext = { fid: string | null; tagIds: string[] };

/**
 * Central place for "pinned tags" scoping rules:
 * - In Flow view, pinned tags are per-flow (persisted in flowtab-swimlane storage).
 * - Elsewhere, pinned tags are global (persisted in pinned-tags storage).
 *
 * Includes guards to prevent state-update loops.
 */
export function useToolbarPinnedTags(params: {
  doc: Y.Doc | null;
  activeView: AppView;
  globalPinnedTagIds: string[];
}) {
  const { doc, activeView, globalPinnedTagIds } = params;

  const [flowPinnedContext, setFlowPinnedContext] = useState<FlowPinnedContext>({ fid: null, tagIds: [] });

  const toolbarPinnedTagIds = useMemo(
    () => (activeView === 'flows' ? flowPinnedContext.tagIds : globalPinnedTagIds),
    [activeView, flowPinnedContext.tagIds, globalPinnedTagIds],
  );

  const onSelectedFlowChange = useCallback((fid: string | null) => {
    setFlowPinnedContext((prev) => (prev.fid === fid ? prev : { ...prev, fid }));
  }, []);

  const onSelectedFlowPinnedTagIdsChange = useCallback((tagIds: string[]) => {
    const next = Array.isArray(tagIds) ? tagIds : [];
    setFlowPinnedContext((prev) => (isStringArrayEqual(prev.tagIds, next) ? prev : { ...prev, tagIds: next }));
  }, []);

  const onPinnedTagIdsChange = useCallback(
    (next: string[]) => {
      if (!doc) return;
      const normalized = Array.isArray(next) ? next : [];
      if (activeView === 'flows') {
        const fid = flowPinnedContext.fid;
        if (!fid) return;
        const base = loadFlowTabSwimlane(doc, fid) || buildDefaultFlowTabSwimlane(fid);
        saveFlowTabSwimlane(doc, { ...base, pinnedTagIds: normalized });
        return;
      }
      savePinnedTags(doc, { tagIds: normalized });
    },
    [activeView, doc, flowPinnedContext.fid],
  );

  return {
    toolbarPinnedTagIds,
    onPinnedTagIdsChange,
    onSelectedFlowChange,
    onSelectedFlowPinnedTagIdsChange,
  };
}

