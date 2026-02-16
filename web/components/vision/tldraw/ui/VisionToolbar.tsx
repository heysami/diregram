'use client';

import { DefaultToolbar, DefaultToolbarContent, TldrawUiMenuToolItem, useEditor, useValue } from 'tldraw';
import { isVectorPenActive, VECTOR_PEN_TOOL_ID } from '@/components/vision/tldraw/vector-pen';

export function VisionToolbar() {
  const editor = useEditor();
  const penActive = useValue(
    'nxVectorPenActive',
    () => {
      return isVectorPenActive(editor);
    },
    [editor],
  );

  return (
    <DefaultToolbar>
      <>
        <DefaultToolbarContent />
        <TldrawUiMenuToolItem toolId={VECTOR_PEN_TOOL_ID} isSelected={penActive} />
      </>
    </DefaultToolbar>
  );
}

