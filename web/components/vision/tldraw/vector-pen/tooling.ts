'use client';

import type { Editor } from 'tldraw';
import { toggleVectorPen, VECTOR_PEN_TOOL_ID } from '@/components/vision/tldraw/vector-pen/meta';

export const vectorPenTranslations = {
  en: {
    'tool.vectorPen': 'Vector Pen',
  },
} as const;

export function addVectorPenTool(editor: Editor, tools: Record<string, any>) {
  return {
    ...(tools as any),
    [VECTOR_PEN_TOOL_ID]: {
      id: VECTOR_PEN_TOOL_ID,
      label: 'tool.vectorPen',
      icon: 'tool-pencil',
      kbd: 'p',
      onSelect() {
        toggleVectorPen(editor);
      },
    },
  } as any;
}

