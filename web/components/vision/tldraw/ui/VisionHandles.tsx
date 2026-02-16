'use client';

import type { TLHandlesProps } from '@tldraw/editor';
import { useEditor, useValue } from 'tldraw';

/**
 * tldraw hides handles while editing shapes (select.editing_shape) except for notes.
 * We want gradient handles to be available for Vision shapes (e.g. nxtext) even while editing.
 */
export function VisionHandles({ children }: TLHandlesProps) {
  const editor = useEditor();

  const shouldDisplayHandles = useValue(
    'visionShouldDisplayHandles',
    () => {
      if (editor.isInAny('select.idle', 'select.pointing_handle', 'select.pointing_shape')) return true;
      if (editor.isInAny('select.editing_shape')) {
        const only = editor.getOnlySelectedShape();
        if (!only) return false;
        // Keep note behavior + allow Vision shapes with custom handles while editing.
        return (
          editor.isShapeOfType(only as any, 'note') ||
          (only as any).type === 'nxtext' ||
          (only as any).type === 'nxrect' ||
          // Allow point editing handles for vectorized shapes.
          (only as any).type === 'draw' ||
          (only as any).type === 'line'
        );
      }
      return false;
    },
    [editor],
  );

  if (!shouldDisplayHandles) return null;

  return (
    <svg className="tl-user-handles tl-overlays__item" aria-hidden="true">
      {children}
    </svg>
  );
}

