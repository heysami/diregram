'use client';

/**
 * Vision tldraw toolbar filtering.
 *
 * NOTE: Vision v2 canvas allowlist lives in `web/components/vision/v2/tldraw/toolAllowlist.ts`.
 * We re-export it here to keep legacy import paths stable.
 */

export function filterVisionTools(tools: Record<string, any>) {
  // IMPORTANT: Vision should avoid default tldraw "generic" shape tools (`geo`, `shape`, `frame`, etc.).
  // We allow only tools that we either implement natively or auto-convert deterministically.
  const allowed = new Set(['select', 'hand', 'draw', 'arrow', 'text', 'rectangle', 'ellipse', 'frame']);
  const next: Record<string, any> = {};
  for (const [key, tool] of Object.entries(tools as any)) {
    const id = (tool as any)?.id ?? key;
    if (!allowed.has(String(id)) && !allowed.has(String(key))) continue;
    next[key] = tool;
  }
  return next;
}

export { filterVisionCanvasTools } from '@/components/vision/v2/tldraw/toolAllowlist';

