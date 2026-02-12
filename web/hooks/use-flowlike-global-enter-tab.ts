import { useEffect } from 'react';

/**
 * DO NOT REGRESS.
 *
 * Problem (historic / recurring):
 * - In Flow tab (swimlane), other focusable controls (lane/stage dropdowns, editors, overlays)
 *   can bypass the canvas container's React `onKeyDown` handler.
 * - Over time, this manifests as "Enter/Tab randomly stops creating nodes" in Flow tab,
 *   sometimes after switching between Canvas/Flow/Data Objects.
 *
 * Solution:
 * - When running in "flow-like" mode, capture Enter/Tab at the WINDOW level (capture phase),
 *   ignore real form fields, and delegate to the same create-sibling/create-child logic.
 *
 * This intentionally duplicates the behavior of the container key handler, but is isolated here
 * so future edits don't accidentally remove it.
 */
export function useFlowlikeGlobalEnterTab(opts: {
  enabled: boolean;
  isEditing: boolean;
  hasSelection: boolean;
  getIsFromFormField: (target: EventTarget | null) => boolean;
  onEnter: () => void;
  onTab: () => void;
}) {
  const { enabled, isEditing, hasSelection, getIsFromFormField, onEnter, onTab } = opts;

  useEffect(() => {
    if (!enabled) return;
    const onWinKeyDown = (e: KeyboardEvent) => {
      if (getIsFromFormField(e.target)) return;
      if (isEditing) return;
      if (!hasSelection) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onEnter();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        onTab();
        return;
      }
    };

    window.addEventListener('keydown', onWinKeyDown, true);
    return () => window.removeEventListener('keydown', onWinKeyDown, true);
  }, [enabled, getIsFromFormField, hasSelection, isEditing, onEnter, onTab]);
}

