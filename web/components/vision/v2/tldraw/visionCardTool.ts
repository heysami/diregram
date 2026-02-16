'use client';

import type { Editor } from 'tldraw';
import { createShapeId } from '@tldraw/tlschema';

export const VISION_CARD_TOOL_ID = 'visionCard';

export const visionCardTranslations = {
  en: {
    'tool.visionCard': 'Card',
  },
} as const;

export function addVisionCardTool(editor: Editor, tools: Record<string, any>) {
  return {
    ...(tools as any),
    [VISION_CARD_TOOL_ID]: {
      id: VISION_CARD_TOOL_ID,
      label: 'tool.visionCard',
      icon: 'tool-rectangle',
      kbd: 'c',
      onSelect() {
        const w = 360;
        const h = 240;

        let x = 0;
        let y = 0;
        try {
          const b = editor.getViewportPageBounds();
          x = b.x + b.w / 2 - w / 2;
          y = b.y + b.h / 2 - h / 2;
        } catch {
          // ignore
        }

        const id = createShapeId();
        try {
          editor.createShape({
            id: id as any,
            type: 'nxcard' as any,
            x,
            y,
            props: { w, h },
          } as any);
          editor.setSelectedShapes([id as any]);
        } catch {
          // ignore
        }

        // Always return to select so "Card" behaves like a quick action tool.
        try {
          editor.setCurrentTool('select');
        } catch {
          // ignore
        }
      },
    },
  } as any;
}

