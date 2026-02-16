import type { Editor, TLShapeId } from 'tldraw';

export function setHiddenForSubtree(editor: Editor, rootId: TLShapeId, hidden: boolean, opts?: { includeRoot?: boolean }): void {
  const includeRoot = opts?.includeRoot !== false;
  let ids: string[] = [];
  try {
    ids = ((editor as any).getShapeAndDescendantIds?.(rootId as any) || []).map(String);
  } catch {
    ids = [String(rootId)];
  }
  const updates: any[] = [];
  for (const id of ids) {
    if (!includeRoot && String(id) === String(rootId)) continue;
    const s: any = editor.getShape(id as any);
    if (!s) continue;
    const meta: any = { ...(s.meta || {}) };
    const prevHidden = Boolean(meta.hidden);
    // IMPORTANT: tldraw merges meta patches; omitting / deleting keys will not clear existing meta.
    // Use explicit boolean so we can reliably toggle visibility.
    meta.hidden = hidden ? true : false;
    const nextHidden = Boolean(meta.hidden);
    if (prevHidden !== nextHidden) updates.push({ id: s.id, type: s.type, meta });
  }
  if (updates.length) {
    try {
      editor.updateShapes(updates as any);
    } catch {
      // ignore
    }
  }
}

export function setProxyReadyFlag(editor: Editor, source: any, ready: boolean): void {
  if (!source?.id) return;
  try {
    const meta: any = { ...(source.meta || {}) };
    const prev = Boolean(meta.nxFxProxyReady);
    const next = Boolean(ready);
    if (prev === next) return;
    if (next) meta.nxFxProxyReady = true;
    else delete meta.nxFxProxyReady;
    editor.updateShapes([{ id: source.id, type: source.type, meta } as any]);
  } catch {
    // ignore
  }
}

