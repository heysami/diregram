'use client';

import type { Editor } from 'tldraw';

export const VISION_ANNOT_LINE_TOOL_ID = 'visionAnnotLine';
export const VISION_ANNOT_RECT_TOOL_ID = 'visionAnnotRect';

export const NX_VISION_ANNOT_MODE_META_KEY = 'nxVisionAnnotMode' as const;
export type VisionAnnotMode = 'line' | 'rect' | null;

export const visionAnnotationTranslations = {
  en: {
    'tool.visionAnnotLine': 'Line annotation',
    'tool.visionAnnotRect': 'Rect annotation',
  },
} as const;

export function getVisionAnnotMode(editor: Editor): VisionAnnotMode {
  try {
    const meta: any = (editor as any).getInstanceState?.()?.meta || {};
    const v = meta?.[NX_VISION_ANNOT_MODE_META_KEY];
    return v === 'line' || v === 'rect' ? v : null;
  } catch {
    return null;
  }
}

export function setVisionAnnotMode(editor: Editor, mode: VisionAnnotMode): void {
  try {
    const prev: any = (editor as any).getInstanceState?.()?.meta || {};
    const next = { ...(prev || {}) };
    if (mode) next[NX_VISION_ANNOT_MODE_META_KEY] = mode;
    else next[NX_VISION_ANNOT_MODE_META_KEY] = null;
    (editor as any).updateInstanceState?.({ meta: next } as any);
  } catch {
    // ignore
  }
}

function toggleMode(editor: Editor, mode: Exclude<VisionAnnotMode, null>) {
  const cur = getVisionAnnotMode(editor);
  setVisionAnnotMode(editor, cur === mode ? null : mode);
}

export function addVisionAnnotationTools(editor: Editor, tools: Record<string, unknown>) {
  return {
    ...(tools as Record<string, unknown>),

    [VISION_ANNOT_LINE_TOOL_ID]: {
      id: VISION_ANNOT_LINE_TOOL_ID,
      label: 'tool.visionAnnotLine',
      icon: 'tool-pencil',
      onSelect() {
        // Drag-first behavior: switch into native `line` tool, but mark instance meta so we can
        // finalize the created line as an annotation on pointer-up.
        toggleMode(editor, 'line');
        try {
          editor.setCurrentTool('line');
        } catch {
          // ignore
        }
      },
    },

    [VISION_ANNOT_RECT_TOOL_ID]: {
      id: VISION_ANNOT_RECT_TOOL_ID,
      label: 'tool.visionAnnotRect',
      icon: 'tool-rectangle',
      onSelect() {
        // Drag-first behavior: switch into native rectangle tool, but mark instance meta so we can
        // finalize the created shape as an annotation on pointer-up.
        toggleMode(editor, 'rect');
        try {
          // In this tldraw version, rectangle is a geo-subtool.
          editor.setCurrentTool('rectangle');
        } catch {
          try {
            editor.setCurrentTool('geo' as any);
          } catch {
            // ignore
          }
        }
      },
    },
  } as Record<string, unknown>;
}

