'use client';

import { DefaultToolbar, DefaultToolbarContent, TldrawUiMenuToolItem, useEditor, useValue } from 'tldraw';
import { getVisionAnnotMode, VISION_ANNOT_LINE_TOOL_ID, VISION_ANNOT_RECT_TOOL_ID } from '@/components/vision/tldraw/annotations/visionAnnotationTools';
import { isVectorPenActive, VECTOR_PEN_TOOL_ID } from '@/components/vision/tldraw/vector-pen/meta';

export function VisionToolbar() {
  const editor = useEditor();
  const vectorPenActive = useValue(
    'vision.vectorPen.active',
    () => {
      try {
        return isVectorPenActive(editor);
      } catch {
        return false;
      }
    },
    [editor],
  );
  const annotMode = useValue(
    'vision.annot.mode',
    () => {
      try {
        return getVisionAnnotMode(editor);
      } catch {
        return null;
      }
    },
    [editor],
  );

  return (
    <DefaultToolbar>
      <>
        {/* Let tldraw render built-in tools + selection state (geo subtools, etc.). */}
        <DefaultToolbarContent />

        {/* Our custom tools/actions. */}
        <TldrawUiMenuToolItem toolId={VECTOR_PEN_TOOL_ID} isSelected={vectorPenActive} />
        <TldrawUiMenuToolItem toolId={VISION_ANNOT_LINE_TOOL_ID} isSelected={annotMode === 'line'} />
        <TldrawUiMenuToolItem toolId={VISION_ANNOT_RECT_TOOL_ID} isSelected={annotMode === 'rect'} />
      </>
    </DefaultToolbar>
  );
}

