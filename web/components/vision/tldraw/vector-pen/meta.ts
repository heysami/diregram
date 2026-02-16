'use client';

import type { Editor } from 'tldraw';

export const VECTOR_PEN_TOOL_ID = 'nxvectorpen' as const;

export const META_VECTOR_PEN = 'nxVectorPen' as const;
export const META_SELECTED_NODE_ID = 'nxSelectedNodeId' as const;

export type VectorPenMeta = {
  [META_VECTOR_PEN]?: boolean;
  [META_SELECTED_NODE_ID]?: string | null;
};

export function getVectorPenMeta(editor: Editor): VectorPenMeta {
  try {
    const meta: any = editor.getInstanceState()?.meta || {};
    return meta as VectorPenMeta;
  } catch {
    return {};
  }
}

export function setVectorPenMeta(editor: Editor, patch: Partial<VectorPenMeta>): void {
  try {
    const prev = getVectorPenMeta(editor);
    editor.updateInstanceState({ meta: { ...(prev as any), ...(patch as any) } as any });
  } catch {
    // ignore
  }
}

export function isVectorPenActive(editor: Editor): boolean {
  return !!getVectorPenMeta(editor)[META_VECTOR_PEN];
}

export function getSelectedNodeId(editor: Editor): string | null {
  const v = getVectorPenMeta(editor)[META_SELECTED_NODE_ID];
  return typeof v === 'string' ? v : null;
}

export function setSelectedNodeId(editor: Editor, id: string | null): void {
  setVectorPenMeta(editor, { [META_SELECTED_NODE_ID]: id } as any);
}

export function toggleVectorPen(editor: Editor): boolean {
  const meta = getVectorPenMeta(editor);
  const next = !meta[META_VECTOR_PEN];
  setVectorPenMeta(editor, { [META_VECTOR_PEN]: next, [META_SELECTED_NODE_ID]: null } as any);
  try {
    editor.setCurrentTool('select');
  } catch {
    // ignore
  }
  return next;
}

