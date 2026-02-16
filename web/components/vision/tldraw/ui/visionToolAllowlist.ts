'use client';

/**
 * Vision tldraw toolbar filtering.
 *
 * tldraw tool ids/keys vary slightly across versions, so we match both tool `id` and map `key`.
 */
import { VECTOR_PEN_TOOL_ID } from '@/components/vision/tldraw/vector-pen';

export function filterVisionTools(tools: Record<string, any>) {
  // IMPORTANT: Vision should avoid default tldraw "generic" shape tools (`geo`, `shape`, `frame`, etc.).
  // We allow only tools that we either implement natively or auto-convert deterministically.
  const allowed = new Set(['select', 'hand', 'arrow', 'text', 'rectangle', 'ellipse', VECTOR_PEN_TOOL_ID]);
  const next: Record<string, any> = {};
  for (const [key, tool] of Object.entries(tools as any)) {
    const id = (tool as any)?.id ?? key;
    if (!allowed.has(String(id)) && !allowed.has(String(key))) continue;
    next[key] = tool;
  }
  return next;
}

