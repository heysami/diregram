'use client';

import type { Editor } from 'tldraw';

export function coerceId(x: any): string {
  return String(x || '').trim();
}

export function getCurrentPageId(editor: Editor): any {
  try {
    return (editor as any).getCurrentPageId?.() || (editor as any).getCurrentPage?.()?.id || 'page:page';
  } catch {
    return 'page:page';
  }
}

export function getShape(editor: Editor, id: string): any | null {
  try {
    return (editor as any).getShape?.(id as any) || null;
  } catch {
    return null;
  }
}

export function getAllPageShapeIds(editor: Editor): string[] {
  try {
    return Array.from((editor as any).getCurrentPageShapeIds?.() || []).map(String);
  } catch {
    return [];
  }
}

/** Deep traversal of all shapes on current page (includes nested children). */
export function getAllShapeIdsDeep(editor: Editor): string[] {
  const pageId = getCurrentPageId(editor);
  const out: string[] = [];
  const seen = new Set<string>();
  const stack: string[] = [coerceId(pageId)];
  while (stack.length) {
    const parentId = coerceId(stack.pop());
    if (!parentId) continue;
    let kids: string[] = [];
    try {
      kids = ((editor as any).getSortedChildIdsForParent?.(parentId as any) || []).map(String);
    } catch {
      kids = [];
    }
    for (const kid of kids) {
      const id = coerceId(kid);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      stack.push(id);
    }
  }
  return out;
}

export function getDescendantIds(editor: Editor, rootId: string): string[] {
  const rid = coerceId(rootId);
  if (!rid) return [];
  try {
    const ids = ((editor as any).getShapeAndDescendantIds?.(rid as any) || []).map(String);
    if (Array.isArray(ids) && ids.length) return ids.map(coerceId).filter(Boolean);
  } catch {
    // ignore
  }
  // Fallback: walk via getSortedChildIdsForParent
  const out: string[] = [];
  const seen = new Set<string>();
  const stack: string[] = [rid];
  while (stack.length) {
    const cur = coerceId(stack.pop());
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    let kids: string[] = [];
    try {
      kids = ((editor as any).getSortedChildIdsForParent?.(cur as any) || []).map(String);
    } catch {
      kids = [];
    }
    for (const k of kids) stack.push(coerceId(k));
  }
  return out;
}

export function safeUpdateShapes(editor: Editor, updates: any[]): void {
  if (!updates.length) return;
  try {
    (editor as any).updateShapes?.(updates as any);
  } catch {
    // ignore
  }
}

export function safeDeleteShapes(editor: Editor, ids: string[]): void {
  const del = ids.map(coerceId).filter(Boolean);
  if (!del.length) return;
  try {
    (editor as any).deleteShapes?.(del as any);
  } catch {
    // ignore
  }
}

export function safeCreateShapes(editor: Editor, shapes: any[]): void {
  if (!shapes.length) return;
  try {
    (editor as any).createShapes?.(shapes as any);
  } catch {
    // ignore
  }
}

