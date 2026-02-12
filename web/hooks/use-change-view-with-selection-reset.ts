import { useCallback } from 'react';
import type { AppView } from '@/components/AppHeader';

export function useChangeViewWithSelectionReset<TSelectedExpandedGridNode>(params: {
  setActiveView: (v: AppView | ((prev: AppView) => AppView)) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setSelectedExpandedGridNode: (sel: TSelectedExpandedGridNode | null) => void;
}) {
  const { setActiveView, setSelectedNodeId, setSelectedNodeIds, setSelectedExpandedGridNode } = params;

  return useCallback(
    (next: AppView | ((v: AppView) => AppView)) => {
      setActiveView((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        return resolved;
      });
      // Selection is shared across views, but roots differ (Flow tab filters roots).
      // If we keep a selected node from another view, create-child/sibling can no-op.
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedExpandedGridNode(null);
    },
    [setActiveView, setSelectedNodeId, setSelectedNodeIds, setSelectedExpandedGridNode],
  );
}

