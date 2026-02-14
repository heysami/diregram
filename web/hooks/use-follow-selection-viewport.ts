import { useCallback, useRef } from 'react';

/**
 * Keep the viewport following keyboard-driven selection changes and structural moves.
 *
 * Design goals:
 * - Modular: no direct dependency on NexusCanvas internals (layout, refs, etc.)
 * - Safe: does not change keyboard shortcuts; only requests viewport centering
 * - Robust to id churn: structural moves can change ids (lineIndex-derived), so we "center after pending select resolves"
 */
export function useFollowSelectionViewport(opts: {
  /**
   * Center immediately (uses current layout/animated layout).
   * Good for keyboard navigation where the node id is stable.
   */
  centerNow: (nodeId: string) => void;

  /**
   * Center after things settle (e.g. after a move that triggers layout recompute / id churn).
   * Usually implemented by setting a "pending center" ref that a layout-aware effect consumes.
   */
  requestCenterOnFinalLayout: (nodeId: string) => void;
}) {
  const { centerNow, requestCenterOnFinalLayout } = opts;

  const centerAfterNextPendingSelectRef = useRef(false);

  const followKeyboardNavigation = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) return;
      centerNow(nodeId);
    },
    [centerNow],
  );

  const requestFollowAfterPendingSelect = useCallback(() => {
    centerAfterNextPendingSelectRef.current = true;
  }, []);

  const onPendingSelectResolved = useCallback(
    (resolvedNodeId: string | null) => {
      if (!resolvedNodeId) return;
      if (!centerAfterNextPendingSelectRef.current) return;
      centerAfterNextPendingSelectRef.current = false;
      requestCenterOnFinalLayout(resolvedNodeId);
    },
    [requestCenterOnFinalLayout],
  );

  return {
    followKeyboardNavigation,
    requestFollowAfterPendingSelect,
    onPendingSelectResolved,
  };
}

