import type { Editor } from 'tldraw';

export type ProxyMeta = { nxFxProxy?: { sourceId?: string } };

export function debounce(fn: () => void, ms: number) {
  let t: any = null;
  const d = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, ms);
  };
  (d as any).cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return d as (() => void) & { cancel: () => void };
}

export function isProxy(shape: any): boolean {
  return shape?.type === 'nxfx';
}

export function isGroupLike(shape: any): boolean {
  return shape?.type === 'group' || shape?.type === 'frame';
}

export function getProxySourceId(shape: any): string | null {
  const m = (shape?.meta || {}) as ProxyMeta;
  const sid = m?.nxFxProxy?.sourceId;
  return typeof sid === 'string' && sid ? sid : null;
}

export function isEditMode(shape: any): boolean {
  return Boolean(shape?.meta?.nxFxEditMode);
}

export function safeStringify(x: any): string {
  try {
    return JSON.stringify(x) || '';
  } catch {
    return '';
  }
}

export function getAllPageShapeIds(editor: Editor): string[] {
  try {
    return Array.from(editor.getCurrentPageShapeIds?.() || []).map(String);
  } catch {
    return [];
  }
}

export function collectAllDescendants(editor: Editor, rootIds: string[]): string[] {
  const out = new Set<string>();
  const stack = [...rootIds];
  while (stack.length) {
    const id = String(stack.pop() || '');
    if (!id || out.has(id)) continue;
    out.add(id);
    try {
      const kids = ((editor as any).getSortedChildIdsForParent?.(id as any) || []).map(String);
      for (const k of kids) stack.push(k);
    } catch {
      // ignore
    }
  }
  return Array.from(out);
}

