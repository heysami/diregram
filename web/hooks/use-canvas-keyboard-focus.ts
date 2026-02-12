import { useCallback, useEffect } from 'react';

export function useCanvasKeyboardFocus(opts: {
  containerRef: React.RefObject<HTMLElement | null>;
  editingNodeId: string | null;
  selectedNodeId: string | null;
  focusTick?: number;
}) {
  const { containerRef, editingNodeId, selectedNodeId, focusTick } = opts;

  const focusCanvas = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.focus();
  }, [containerRef]);

  // Focus on mount (helps when switching views).
  useEffect(() => {
    focusCanvas();
  }, [focusCanvas]);

  // Focus when selection changes (existing behavior).
  useEffect(() => {
    if (!editingNodeId && selectedNodeId) focusCanvas();
  }, [editingNodeId, selectedNodeId, focusCanvas]);

  // Optional external focus request tick (Flow tab uses this after interacting with selects).
  useEffect(() => {
    if (typeof focusTick !== 'number') return;
    focusCanvas();
  }, [focusTick, focusCanvas]);

  const focusOnPointerEvent = useCallback(
    (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) {
        focusCanvas();
        return;
      }
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        el.isContentEditable ||
        el.closest('input,textarea,select,[contenteditable="true"]')
      ) {
        return; // keep focus on the control
      }
      focusCanvas();
    },
    [focusCanvas],
  );

  return { focusCanvas, focusOnPointerEvent };
}

