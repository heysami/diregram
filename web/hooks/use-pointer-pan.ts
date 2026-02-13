import { useCallback, useRef, useState } from 'react';

/**
 * Pointer-capture panning helper.
 *
 * DO NOT REGRESS.
 *
 * Problem:
 * - Drag-to-pan can break when child elements stop propagation, or when the pointer leaves the container.
 * - Mouse events behave inconsistently across nested absolute elements.
 *
 * Solution:
 * - Start panning in capture phase.
 * - Use setPointerCapture() so moves keep coming even when the pointer is over children / leaves bounds.
 * - Provide a "didPan" flag so click handlers can ignore drag gestures.
 */
export function usePointerPan(opts: {
  enabled: boolean;
  /** Start pan if over interactive element? (when false, you can require empty-space drags) */
  allowFromInteractive: boolean;
  isInteractiveTarget: (target: EventTarget | null) => boolean;
  onPanBy: (delta: { dx: number; dy: number }) => void;
  onPointerMove?: (evt: PointerEvent) => void;
}) {
  const { enabled, allowFromInteractive, isInteractiveTarget, onPanBy, onPointerMove } = opts;
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    didPan: boolean;
  } | null>(null);

  const start = useCallback(
    (evt: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      if (evt.button !== 0) return;
      const isOverInteractive = isInteractiveTarget(evt.target);
      if (isOverInteractive && !allowFromInteractive) return;

      (evt.currentTarget as HTMLDivElement).setPointerCapture(evt.pointerId);
      dragRef.current = {
        pointerId: evt.pointerId,
        startX: evt.clientX,
        startY: evt.clientY,
        didPan: false,
      };
      setIsDragging(true);
    },
    [allowFromInteractive, enabled, isInteractiveTarget],
  );

  const move = useCallback(
    (evt: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const d = dragRef.current;
      if (!d) return;
      if (evt.pointerId !== d.pointerId) return;
      const dx = evt.clientX - d.startX;
      const dy = evt.clientY - d.startY;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.didPan = true;
      onPanBy({ dx, dy });
      onPointerMove?.(evt.nativeEvent);
    },
    [enabled, onPanBy, onPointerMove],
  );

  const end = useCallback((evt: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (evt.pointerId !== d.pointerId) return;
    try {
      (evt.currentTarget as HTMLDivElement).releasePointerCapture(evt.pointerId);
    } catch {}
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const cancel = useCallback((evt: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (evt.pointerId !== d.pointerId) return;
    try {
      (evt.currentTarget as HTMLDivElement).releasePointerCapture(evt.pointerId);
    } catch {}
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const consumeDidPan = useCallback(() => {
    const d = dragRef.current;
    if (!d) return false;
    if (!d.didPan) return false;
    d.didPan = false;
    return true;
  }, []);

  return {
    isDragging,
    dragRef,
    consumeDidPan,
    handlers: {
      onPointerDownCapture: start,
      onPointerMoveCapture: move,
      onPointerUpCapture: end,
      onPointerCancelCapture: cancel,
    },
  };
}

