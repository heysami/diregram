'use client';

import { DefaultToolbar, DefaultToolbarContent, TldrawUiMenuToolItem } from 'tldraw';
import { VISION_CARD_TOOL_ID } from '@/components/vision/v2/tldraw/visionCardTool';

export function VisionCanvasToolbar() {
  return (
    <DefaultToolbar>
      <>
        <DefaultToolbarContent />
        <TldrawUiMenuToolItem toolId={VISION_CARD_TOOL_ID} />
      </>
    </DefaultToolbar>
  );
}

