'use client';

import { VISION_CARD_TOOL_ID } from '@/components/vision/v2/tldraw/visionCardTool';

/**
 * Vision v2 canvas tool allowlist.
 *
 * Keep this conservative so future Vision features don't accidentally add tools that change
 * the editing model for the main canvas.
 */
export function filterVisionCanvasTools(tools: Record<string, any>) {
  const allowed = new Set(['select', 'hand', 'draw', 'arrow', 'text', 'rectangle', 'frame', VISION_CARD_TOOL_ID]);
  const next: Record<string, any> = {};
  for (const [key, tool] of Object.entries(tools as any)) {
    const id = (tool as any)?.id ?? key;
    if (!allowed.has(String(id)) && !allowed.has(String(key))) continue;
    next[key] = tool;
  }
  return next;
}

