'use client';

import type { Editor } from 'tldraw';

function isUserInteracting(editor: Editor): boolean {
  // Goal: avoid expensive raster renders while the pointer is down / shapes are transforming.
  // These state names are from tldraw’s SelectTool child states.
  try {
    const inSelectState = (editor as any).isInAny?.(
      'select.translating',
      'select.resizing',
      'select.rotating',
      'select.dragging_handle',
      'select.pointing_handle',
      'select.pointing_shape',
      'select.pointing_rotate_handle',
      'select.crop.translating_crop',
      'select.crop.pointing_crop',
      'select.crop.pointing_crop_handle',
    );
    const dragging = Boolean((editor as any).inputs?.getIsDragging?.());
    const pointing = Boolean((editor as any).inputs?.getIsPointing?.());
    const pinching = Boolean((editor as any).inputs?.getIsPinching?.());
    return Boolean(inSelectState) || dragging || pointing || pinching;
  } catch {
    return false;
  }
}

export function startFxInteractionMonitor(
  editor: Editor,
  onChange: (active: boolean) => void,
): () => void {
  let disposed = false;
  let raf: number | null = null;
  let last = false;

  const tick = () => {
    if (disposed) return;
    const now = isUserInteracting(editor);
    if (now !== last) {
      last = now;
      try {
        onChange(now);
      } catch {
        // ignore
      }
    }
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);

  return () => {
    disposed = true;
    if (raf) {
      try {
        window.cancelAnimationFrame(raf);
      } catch {
        // ignore
      }
    }
    raf = null;
  };
}

